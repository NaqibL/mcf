"""
Role / job-title cluster discovery — autonomous exploration.

Goals:
  1. Find natural role clusters (HDBSCAN + high-k K-Means sweep)
  2. Profile each cluster by titles, categories, salary, experience
  3. Build a role taxonomy (named role families with centroid vectors)
  4. Multi-label threshold analysis — what % of jobs sit near multiple role centroids?
  5. Cross-cluster similarity matrix — which roles overlap?

Uses cached UMAP coords + re-fetches embeddings (saves X.npy for future runs).
"""

from __future__ import annotations
import sys
sys.stdout.reconfigure(encoding="utf-8")

import json, os, pickle, warnings
from pathlib import Path
from collections import Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import numpy as np
import pandas as pd
import psycopg2, psycopg2.extras
import seaborn as sns
from dotenv import load_dotenv
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
import hdbscan

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid")
plt.rcParams["figure.dpi"] = 120

load_dotenv()

V2_DIR   = Path("data/analysis_v2")
OUT_DIR  = Path("data/analysis_roles")
OUT_DIR.mkdir(parents=True, exist_ok=True)

EMBEDDING_DIMS = 768

# ── 1. Load data (cache embeddings to npy so we never hit DB again) ───────────
X_CACHE = V2_DIR / "embeddings_X.npy"
DF_CACHE = V2_DIR / "df_meta.parquet"

if X_CACHE.exists() and DF_CACHE.exists():
    print("Loading cached embeddings + metadata...")
    X = np.load(X_CACHE)
    df = pd.read_parquet(DF_CACHE)
    print(f"Loaded {len(X):,} jobs, matrix {X.shape}")
else:
    print("Fetching from Supabase...")
    QUERY = """
    SELECT
        j.job_uuid, j.title, j.salary_min, j.salary_max, j.min_years_experience,
        COALESCE(NULLIF(TRIM(BOTH '"' FROM (j.position_levels_json::jsonb->0)::text),''),'Unknown') AS position_level,
        COALESCE(NULLIF(TRIM(BOTH '"' FROM (j.categories_json::jsonb->0)::text),''),'Unknown') AS category,
        e.embedding::text AS embedding_text
    FROM jobs j
    JOIN job_embeddings e ON e.job_uuid = j.job_uuid
    WHERE j.is_active = TRUE AND e.embedding IS NOT NULL
    """
    conn = psycopg2.connect(os.environ["DATABASE_URL"], options="-c statement_timeout=0")
    conn.cursor().execute("SET statement_timeout = 0")
    sc = conn.cursor(name="emb", cursor_factory=psycopg2.extras.RealDictCursor)
    sc.itersize = 2000
    sc.execute(QUERY)
    rows = []
    while True:
        chunk = sc.fetchmany(2000)
        if not chunk: break
        rows.extend(chunk)
        print(f"  {len(rows):,}...", end="\r")
    sc.close(); conn.close()
    print(f"\nFetched {len(rows):,} rows")

    embeddings, records = [], []
    for r in rows:
        try:
            emb = json.loads(r["embedding_text"]) if isinstance(r["embedding_text"], str) else list(r["embedding_text"])
            if len(emb) != EMBEDDING_DIMS: continue
        except: continue
        embeddings.append(emb)
        records.append({k: r[k] for k in ["job_uuid","title","salary_min","salary_max","min_years_experience","position_level","category"]})

    X = np.array(embeddings, dtype=np.float32)
    df = pd.DataFrame(records)
    np.save(X_CACHE, X)
    df.to_parquet(DF_CACHE)
    print(f"Cached embeddings -> {X_CACHE}")

# Load UMAP coords
umap_xy = np.load(V2_DIR / "umap_coords_cache.npy")
df["umap_x"] = umap_xy[:, 0]
df["umap_y"] = umap_xy[:, 1]

print(f"\nDataset: {len(df):,} jobs, {EMBEDDING_DIMS}-dim embeddings")
print(f"Categories ({df['category'].nunique()} unique):")
print(df["category"].value_counts().head(15).to_string())


# ── 2. HDBSCAN — find natural density clusters ────────────────────────────────
print("\n=== HDBSCAN: natural role clusters ===")
# Run on UMAP 2D (fast, stable) with tight settings for role-level granularity
clusterer = hdbscan.HDBSCAN(
    min_cluster_size=200,   # at least 200 jobs to form a role cluster
    min_samples=50,
    cluster_selection_epsilon=0.3,
    metric="euclidean",     # euclidean on UMAP space
)
hdb_labels = clusterer.fit_predict(umap_xy)
df["hdb_cluster"] = hdb_labels

n_hdb = len(set(hdb_labels)) - (1 if -1 in hdb_labels else 0)
noise_pct = (hdb_labels == -1).mean() * 100
print(f"HDBSCAN found {n_hdb} clusters, {noise_pct:.1f}% noise points")

# Profile HDBSCAN clusters
hdb_profiles = []
for c in sorted(set(hdb_labels)):
    if c == -1: continue
    sub = df[df["hdb_cluster"] == c]
    top_titles = sub["title"].value_counts().head(8).to_dict()
    top_cats   = sub["category"].value_counts().head(5).to_dict()
    hdb_profiles.append({
        "cluster": int(c),
        "n": len(sub),
        "salary_min_median": round(float(sub["salary_min"].median()), 0) if sub["salary_min"].notna().any() else None,
        "years_exp_median":  round(float(sub["min_years_experience"].median()), 1) if sub["min_years_experience"].notna().any() else None,
        "top_titles": top_titles,
        "top_categories": top_cats,
    })
hdb_profiles.sort(key=lambda p: p["n"], reverse=True)

print(f"\n{'C':>3}  {'n':>6}  {'Salary':>7}  Top titles")
print("-" * 80)
for p in hdb_profiles[:30]:
    top = list(p["top_titles"].keys())[:3]
    print(f"{p['cluster']:>3}  {p['n']:>6,}  {p['salary_min_median'] or 0:>7,.0f}  {' | '.join(top)}")

# UMAP coloured by HDBSCAN
fig, ax = plt.subplots(figsize=(14, 10))
noise_mask = df["hdb_cluster"] == -1
ax.scatter(df.loc[noise_mask,"umap_x"], df.loc[noise_mask,"umap_y"],
           c="#DDDDDD", s=1, alpha=0.15, linewidths=0, rasterized=True, label="noise")
cmap = plt.cm.get_cmap("tab20", max(n_hdb, 1))
for c in sorted(set(hdb_labels)):
    if c == -1: continue
    mask = df["hdb_cluster"] == c
    ax.scatter(df.loc[mask,"umap_x"], df.loc[mask,"umap_y"],
               c=[cmap(c % 20)], s=2, alpha=0.5, linewidths=0,
               label=f"C{c} (n={mask.sum():,})", rasterized=True)
ax.legend(fontsize=6, loc="lower right", markerscale=3, ncol=2)
ax.set_title(f"HDBSCAN: {n_hdb} natural clusters ({noise_pct:.1f}% noise)", fontsize=12)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")
plt.tight_layout()
plt.savefig(OUT_DIR / "umap_hdbscan.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"\nSaved -> {OUT_DIR}/umap_hdbscan.png")


# ── 3. High-k K-Means sweep: find role-level granularity ─────────────────────
print("\n=== K-Means sweep k=20..80 for role granularity ===")
rng = np.random.default_rng(42)
SIL_SAMPLE = 8_000
sil_idx = rng.choice(len(X), size=SIL_SAMPLE, replace=False)
X_sil = X[sil_idx]

K_RANGE = list(range(20, 85, 5))
sil_scores: dict[int, float] = {}
for k in K_RANGE:
    km_tmp = MiniBatchKMeans(n_clusters=k, random_state=42, n_init=3, batch_size=4096)
    km_tmp.fit(X)
    labels_sil = km_tmp.labels_[sil_idx]
    score = silhouette_score(X_sil, labels_sil, metric="cosine")
    sil_scores[k] = score
    print(f"  k={k:3d}  silhouette={score:.4f}")

best_k_role = max(sil_scores, key=sil_scores.get)
print(f"\nBest role k = {best_k_role}  (sil={sil_scores[best_k_role]:.4f})")

fig, ax = plt.subplots(figsize=(12, 4))
ax.plot(list(sil_scores.keys()), list(sil_scores.values()), marker="o", linewidth=1.5)
ax.axvline(best_k_role, color="red", linestyle="--", label=f"Best k={best_k_role}")
ax.set_xlabel("k"); ax.set_ylabel("Silhouette (cosine)")
ax.set_title("Role-level K-Means silhouette sweep (k=20..80)")
ax.legend()
plt.tight_layout()
plt.savefig(OUT_DIR / "role_silhouette_sweep.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {OUT_DIR}/role_silhouette_sweep.png")


def _infer_role_name(all_titles_lower: str, top_titles: dict) -> str:
    """Heuristic role name from title text."""
    rules = [
        (["software engineer","software developer","backend","frontend","full stack","fullstack"], "Software Engineering"),
        (["data scientist","machine learning","ml engineer","ai engineer","deep learning"], "Data Science / ML"),
        (["data analyst","business analyst","bi analyst","data analytics"], "Data / Business Analytics"),
        (["product manager","product owner","product lead"], "Product Management"),
        (["project manager","programme manager","project lead","pmo"], "Project Management"),
        (["devops","site reliability","platform engineer","cloud engineer","infrastructure"], "DevOps / Cloud"),
        (["qa","quality assurance","test engineer","automation engineer","sdet"], "QA / Testing"),
        (["ux","ui designer","user experience","product designer","interaction designer"], "UX / Design"),
        (["account manager","business development","sales executive","sales manager"], "Sales / BD"),
        (["marketing","digital marketing","content","seo","social media"], "Marketing"),
        (["finance","accountant","financial analyst","treasury","audit"], "Finance / Accounting"),
        (["hr","human resource","talent acquisition","recruiter","people"], "HR / Talent"),
        (["operations","supply chain","logistics","procurement"], "Operations / Supply Chain"),
        (["nurse","nursing","clinical","healthcare","medical","pharmacist","doctor"], "Healthcare / Clinical"),
        (["teacher","lecturer","education","trainer","learning"], "Education / Training"),
        (["lawyer","legal","compliance","risk"], "Legal / Compliance"),
        (["admin","administrative","secretary","receptionist","office"], "Admin / Secretarial"),
        (["customer service","customer support","call centre","helpdesk"], "Customer Service"),
        (["civil engineer","mechanical engineer","electrical engineer","structural"], "Engineering (Non-IT)"),
        (["architect","solution architect","enterprise architect"], "Architecture / Solutions"),
        (["cybersecurity","security analyst","penetration","infosec"], "Cybersecurity"),
        (["consultant","advisory","strategy"], "Consulting / Strategy"),
        (["graphic design","visual","creative","multimedia","illustrator"], "Creative / Design"),
        (["research","scientist","laboratory","r&d"], "Research / Science"),
    ]
    for keywords, name in rules:
        if any(kw in all_titles_lower for kw in keywords):
            return name
    return list(top_titles.keys())[0] if top_titles else "Unknown"


# ── 4. Fit role K-Means and build taxonomy ────────────────────────────────────
print(f"\n=== Building role taxonomy (k={best_k_role}) ===")
km_role = MiniBatchKMeans(n_clusters=best_k_role, random_state=42, n_init=10, batch_size=4096)
km_role.fit(X)
df["role_cluster"] = km_role.labels_
centroids = km_role.cluster_centers_  # shape (k, 768)

role_profiles = []
for c in range(best_k_role):
    sub = df[df["role_cluster"] == c]
    top_titles = sub["title"].value_counts().head(10).to_dict()
    top_cats   = sub["category"].value_counts().head(5).to_dict()
    top_levels = sub["position_level"].value_counts().head(5).to_dict()
    all_titles = " ".join(sub["title"].str.lower().tolist())
    profile = {
        "cluster":           int(c),
        "role_name":         _infer_role_name(all_titles, top_titles),
        "n":                 int(len(sub)),
        "salary_min_median": round(float(sub["salary_min"].median()), 0) if sub["salary_min"].notna().any() else None,
        "salary_max_median": round(float(sub["salary_max"].median()), 0) if sub["salary_max"].notna().any() else None,
        "years_exp_median":  round(float(sub["min_years_experience"].median()), 1) if sub["min_years_experience"].notna().any() else None,
        "top_titles":        {k: int(v) for k, v in list(top_titles.items())[:10]},
        "top_categories":    {k: int(v) for k, v in list(top_cats.items())[:5]},
        "top_levels":        {k: int(v) for k, v in list(top_levels.items())[:5]},
        "centroid_norm":     float(np.linalg.norm(centroids[c])),
    }
    role_profiles.append(profile)

role_profiles.sort(key=lambda p: p["n"], reverse=True)

print(f"\n{'C':>3}  {'n':>6}  {'Salary':>7}  {'Yrs':>4}  Role Name                    Top titles")
print("-" * 100)
for p in role_profiles:
    top = " | ".join(list(p["top_titles"].keys())[:3])
    print(f"{p['cluster']:>3}  {p['n']:>6,}  {p['salary_min_median'] or 0:>7,.0f}  "
          f"{p['years_exp_median'] or 0:>4.1f}  {p['role_name']:<28} {top}")


# ── 5. Cross-cluster cosine similarity matrix ─────────────────────────────────
print("\n=== Cross-cluster cosine similarity matrix ===")
# Normalise centroids before dot product
norms = np.linalg.norm(centroids, axis=1, keepdims=True)
centroids_norm = centroids / np.where(norms > 0, norms, 1)
sim_matrix = centroids_norm @ centroids_norm.T  # (k, k)
np.fill_diagonal(sim_matrix, 0)  # zero self-similarity

# Find pairs of most similar role clusters
n_top = 20
triu_idx = np.triu_indices(best_k_role, k=1)
pair_sims = sim_matrix[triu_idx]
top_pairs_idx = np.argsort(pair_sims)[::-1][:n_top]

print(f"\nTop {n_top} most similar role cluster pairs:")
print(f"{'C_A':>4}  {'C_B':>4}  {'Sim':>6}  Role A                       Role B")
print("-" * 80)
role_name_map = {p["cluster"]: p["role_name"] for p in role_profiles}
pair_results = []
for idx in top_pairs_idx:
    ca = triu_idx[0][idx]
    cb = triu_idx[1][idx]
    sim = pair_sims[idx]
    name_a = role_name_map.get(ca, f"C{ca}")
    name_b = role_name_map.get(cb, f"C{cb}")
    print(f"{ca:>4}  {cb:>4}  {sim:>6.3f}  {name_a:<28} {name_b}")
    pair_results.append({"cluster_a": int(ca), "cluster_b": int(cb), "similarity": round(float(sim), 4),
                          "role_a": name_a, "role_b": name_b})

# Heatmap of similarity matrix (sort clusters by role name for readability)
fig, ax = plt.subplots(figsize=(16, 14))
labels = [f"C{p['cluster']}: {p['role_name'][:18]}" for p in sorted(role_profiles, key=lambda x: x["cluster"])]
sns.heatmap(sim_matrix, ax=ax, cmap="RdYlGn", vmin=0, vmax=0.6,
            xticklabels=labels, yticklabels=labels, linewidths=0.3)
ax.set_title(f"Role cluster cosine similarity (k={best_k_role})", fontsize=12)
plt.xticks(fontsize=6, rotation=90)
plt.yticks(fontsize=6, rotation=0)
plt.tight_layout()
plt.savefig(OUT_DIR / "role_similarity_matrix.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"\nSaved -> {OUT_DIR}/role_similarity_matrix.png")


# ── 6. Multi-label threshold analysis ────────────────────────────────────────
print("\n=== Multi-label threshold analysis ===")
# For each job, compute cosine similarity to all cluster centroids.
# Count how many centroids are within threshold t.
# Sample 20k for speed.
SAMPLE_N = 20_000
sample_idx = rng.choice(len(X), size=min(SAMPLE_N, len(X)), replace=False)
X_sample = X[sample_idx]
# X is already L2-normalised (BGE outputs unit vectors)
# centroids_norm already normalised above
sims_to_centroids = X_sample @ centroids_norm.T  # (sample, k)

thresholds = [0.65, 0.70, 0.75, 0.80, 0.85, 0.90]
multilabel_stats = {}
print(f"\n{'Threshold':>10}  {'Avg labels/job':>14}  {'% multi-label':>14}  {'% 3+ labels':>11}")
print("-" * 55)
for t in thresholds:
    above = (sims_to_centroids >= t)
    labels_per_job = above.sum(axis=1)
    avg_labels     = labels_per_job.mean()
    pct_multi      = (labels_per_job >= 2).mean() * 100
    pct_triple     = (labels_per_job >= 3).mean() * 100
    print(f"{t:>10.2f}  {avg_labels:>14.2f}  {pct_multi:>13.1f}%  {pct_triple:>10.1f}%")
    multilabel_stats[t] = {
        "avg_labels_per_job": round(float(avg_labels), 3),
        "pct_multi_label":    round(float(pct_multi), 2),
        "pct_triple_label":   round(float(pct_triple), 2),
    }

# Find sweet spot: threshold where avg_labels ~ 1.5-2.5 (meaningful overlap, not noise)
sweet_spot_t = None
for t in thresholds:
    avg = multilabel_stats[t]["avg_labels_per_job"]
    if 1.3 <= avg <= 2.5:
        sweet_spot_t = t
        break
if sweet_spot_t is None:
    sweet_spot_t = 0.75  # default fallback

print(f"\nRecommended threshold: {sweet_spot_t} "
      f"(avg {multilabel_stats[sweet_spot_t]['avg_labels_per_job']:.2f} labels/job, "
      f"{multilabel_stats[sweet_spot_t]['pct_multi_label']:.1f}% multi-label)")

# Distribution of label count at sweet spot
above_sweet = (sims_to_centroids >= sweet_spot_t).sum(axis=1)
label_dist = Counter(int(x) for x in above_sweet)
print(f"\nLabel count distribution at threshold={sweet_spot_t}:")
for k_lbl in sorted(label_dist):
    pct = label_dist[k_lbl] / len(above_sweet) * 100
    bar = "#" * int(pct / 2)
    print(f"  {k_lbl:>2} labels: {label_dist[k_lbl]:>6,} jobs ({pct:5.1f}%)  {bar}")


# ── 7. Role overlap deep-dive: which role pairs co-occur most? ────────────────
print("\n=== Role co-occurrence analysis (multi-label) ===")
above_sweet_bool = (sims_to_centroids >= sweet_spot_t)  # (sample, k)

# Find most common (cluster_a, cluster_b) co-occurrence pairs
cooccur = Counter()
for row in above_sweet_bool:
    active = np.where(row)[0].tolist()
    if len(active) >= 2:
        for i in range(len(active)):
            for j in range(i+1, len(active)):
                cooccur[(active[i], active[j])] += 1

print(f"\nTop 20 co-occurring role pairs (threshold={sweet_spot_t}):")
print(f"{'Co-occur':>9}  Role A                       Role B")
print("-" * 70)
cooccur_results = []
for (ca, cb), cnt in cooccur.most_common(20):
    name_a = role_name_map.get(ca, f"C{ca}")
    name_b = role_name_map.get(cb, f"C{cb}")
    print(f"{cnt:>9,}  {name_a:<28} {name_b}")
    cooccur_results.append({"cluster_a": int(ca), "cluster_b": int(cb),
                             "co_occurrences": cnt, "role_a": name_a, "role_b": name_b})


# ── 8. UMAP visualisation coloured by role cluster ───────────────────────────
print("\n=== UMAP visualisations ===")
fig, axes = plt.subplots(1, 2, figsize=(22, 9))

# Plot 1: role clusters (all jobs)
ax = axes[0]
cmap20 = plt.cm.get_cmap("tab20", best_k_role)
for c in range(best_k_role):
    mask = df["role_cluster"] == c
    name = role_name_map.get(c, f"C{c}")
    ax.scatter(df.loc[mask,"umap_x"], df.loc[mask,"umap_y"],
               c=[cmap20(c % 20)], s=1, alpha=0.3, linewidths=0,
               label=f"C{c}:{name[:14]}", rasterized=True)
ax.legend(fontsize=5, loc="lower right", markerscale=3, ncol=2)
ax.set_title(f"Role clusters (k={best_k_role})", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

# Plot 2: category (ground truth)
ax = axes[1]
top_cats = df["category"].value_counts().head(12).index.tolist()
cat_cmap = plt.cm.get_cmap("tab20", len(top_cats))
for i, cat in enumerate(top_cats):
    mask = df["category"] == cat
    ax.scatter(df.loc[mask,"umap_x"], df.loc[mask,"umap_y"],
               c=[cat_cmap(i)], s=1, alpha=0.3, linewidths=0,
               label=f"{cat[:20]} ({mask.sum():,})", rasterized=True)
other_mask = ~df["category"].isin(top_cats)
ax.scatter(df.loc[other_mask,"umap_x"], df.loc[other_mask,"umap_y"],
           c="#CCCCCC", s=1, alpha=0.1, linewidths=0, rasterized=True)
ax.legend(fontsize=6, loc="lower right", markerscale=3, ncol=1)
ax.set_title("Ground truth: job categories", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

plt.suptitle(f"Role structure — {best_k_role} clusters, 69k jobs", fontsize=13)
plt.tight_layout()
plt.savefig(OUT_DIR / "umap_roles.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {OUT_DIR}/umap_roles.png")


# ── 9. Save all artifacts ─────────────────────────────────────────────────────
print("\n=== Saving artifacts ===")

with open(OUT_DIR / "role_taxonomy.json", "w") as f:
    json.dump(role_profiles, f, indent=2)
print(f"Saved role taxonomy ({len(role_profiles)} roles) -> {OUT_DIR}/role_taxonomy.json")

np.save(OUT_DIR / "role_centroids.npy", centroids)
np.save(OUT_DIR / "role_centroids_norm.npy", centroids_norm)
print(f"Saved centroids -> {OUT_DIR}/role_centroids.npy")

with open(km_role_path := OUT_DIR / "kmeans_role_model.pkl", "wb") as f:
    pickle.dump(km_role, f)
print(f"Saved K-Means role model -> {km_role_path}")

summary = {
    "hdbscan_clusters":          n_hdb,
    "hdbscan_noise_pct":         round(noise_pct, 2),
    "best_role_k":               best_k_role,
    "best_role_silhouette":      round(sil_scores[best_k_role], 4),
    "recommended_threshold":     sweet_spot_t,
    "multilabel_at_threshold":   multilabel_stats[sweet_spot_t],
    "multilabel_all_thresholds": {str(k): v for k, v in multilabel_stats.items()},
    "top_similar_pairs":         pair_results[:10],
    "top_cooccurrence_pairs":    cooccur_results[:10],
    "role_silhouette_sweep":     {str(k): round(v, 4) for k, v in sil_scores.items()},
}
with open(OUT_DIR / "role_summary.json", "w") as f:
    json.dump(summary, f, indent=2)

print("\n=== ROLE ANALYSIS SUMMARY ===")
print(json.dumps(summary, indent=2))
print("\nDone.")
