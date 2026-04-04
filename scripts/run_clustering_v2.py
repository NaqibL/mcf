"""
Run the experience clustering analysis (v2 — BGE-base 768-dim).
Mirrors notebooks/experience_clustering_v2.ipynb but runs as a plain script.
Saves plots + summary JSON to data/analysis_v2/.
"""

from __future__ import annotations

import sys
sys.stdout.reconfigure(encoding="utf-8")

import json
import os
import pickle
import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # non-interactive backend for script mode
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
import seaborn as sns
from dotenv import load_dotenv
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid", palette="tab10")
plt.rcParams["figure.dpi"] = 120

load_dotenv()

OUTPUT_DIR = Path("data/analysis_v2")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_NAME = "BAAI/bge-base-en-v1.5"
EMBEDDING_DIMS = 768

print(f"Output dir: {OUTPUT_DIR.resolve()}")
print(f"Model: {MODEL_NAME} ({EMBEDDING_DIMS}-dim)")

# ── Section 1: Data loading ───────────────────────────────────────────────────
print("\n=== Section 1: Loading data ===")

QUERY = """
SELECT
    j.job_uuid,
    j.title,
    j.salary_min,
    j.salary_max,
    j.min_years_experience,
    COALESCE(
        NULLIF(TRIM(BOTH '"' FROM (j.position_levels_json::jsonb->0)::text), ''),
        'Unknown'
    ) AS position_level,
    COALESCE(
        NULLIF(TRIM(BOTH '"' FROM (j.categories_json::jsonb->0)::text), ''),
        'Unknown'
    ) AS category,
    e.embedding::text AS embedding_text
FROM jobs j
JOIN job_embeddings e ON e.job_uuid = j.job_uuid
WHERE j.is_active = TRUE
  AND e.embedding IS NOT NULL
"""

DATABASE_URL = os.environ["DATABASE_URL"]
conn = psycopg2.connect(DATABASE_URL, options="-c statement_timeout=0")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
print("Fetching jobs from Supabase (streaming in chunks)...")
cur.execute("SET statement_timeout = 0")
# Use server-side cursor to stream large result sets without hitting memory/timeout limits
server_cur = conn.cursor(name="emb_cursor", cursor_factory=psycopg2.extras.RealDictCursor)
server_cur.itersize = 2000
server_cur.execute(QUERY)
rows = []
while True:
    chunk = server_cur.fetchmany(2000)
    if not chunk:
        break
    rows.extend(chunk)
    print(f"  fetched {len(rows):,}...", end="\r")
server_cur.close()
cur.close()
conn.close()
print(f"\nFetched {len(rows):,} rows total")

records = []
embeddings = []
skipped_dim = 0

for r in rows:
    try:
        raw = r["embedding_text"]
        emb = json.loads(raw) if isinstance(raw, str) else list(raw)
        if len(emb) != EMBEDDING_DIMS:
            skipped_dim += 1
            continue
    except (json.JSONDecodeError, TypeError):
        continue
    embeddings.append(emb)
    records.append({
        "job_uuid":             r["job_uuid"],
        "title":                r["title"],
        "salary_min":           r["salary_min"],
        "salary_max":           r["salary_max"],
        "min_years_experience": r["min_years_experience"],
        "position_level":       r["position_level"],
        "category":             r["category"],
    })

if skipped_dim:
    print(f"Skipped {skipped_dim:,} rows with wrong embedding dim (stale 384-dim rows)")

X = np.array(embeddings, dtype=np.float32)
df = pd.DataFrame(records)

print(f"Matrix shape: {X.shape}")
print(f"\nPosition level distribution:")
print(df["position_level"].value_counts().to_string())
labeled_count = (df["position_level"] != "Unknown").sum()
print(f"\nLabeled jobs: {labeled_count:,} ({labeled_count/len(df)*100:.1f}%)")
print(f"min_years_experience non-null: {df['min_years_experience'].notna().sum():,}")

# ── Section 2: UMAP ───────────────────────────────────────────────────────────
print("\n=== Section 2: UMAP ===")
import umap as umap_lib

UMAP_SAMPLE = 15_000
rng = np.random.default_rng(42)
sample_idx = rng.choice(len(X), size=min(UMAP_SAMPLE, len(X)), replace=False)
X_sample = X[sample_idx]

UMAP_CACHE = OUTPUT_DIR / "umap_coords_cache.npy"
if UMAP_CACHE.exists():
    print("Loading cached UMAP coords...")
    xy = np.load(UMAP_CACHE)
else:
    print(f"Fitting UMAP on {len(sample_idx):,}-job sample (768-dim)...")
    reducer = umap_lib.UMAP(
        n_components=2,
        n_neighbors=30,
        min_dist=0.05,
        metric="cosine",
        random_state=42,
        low_memory=False,
    )
    reducer.fit(X_sample)
    print("Transforming full dataset...")
    xy = reducer.transform(X)
    np.save(UMAP_CACHE, xy)
    print(f"Saved UMAP cache -> {UMAP_CACHE}")

df["umap_x"] = xy[:, 0]
df["umap_y"] = xy[:, 1]
print(f"UMAP range x={xy[:,0].min():.2f}..{xy[:,0].max():.2f}, "
      f"y={xy[:,1].min():.2f}..{xy[:,1].max():.2f}")

PL_PALETTE = {
    "Fresh/entry level":  "#2196F3",
    "Non-executive":      "#64B5F6",
    "Junior Executive":   "#4CAF50",
    "Executive":          "#8BC34A",
    "Professional":       "#9C27B0",
    "Senior Executive":   "#FF9800",
    "Manager":            "#F44336",
    "Middle Management":  "#E91E63",
    "Senior Management":  "#B71C1C",
    "C-Suite/VP":         "#000000",
    "Unknown":            "#EEEEEE",
}

fig, axes = plt.subplots(1, 3, figsize=(22, 7))
fig.suptitle(f"UMAP of {len(df):,} jobs — {MODEL_NAME} ({EMBEDDING_DIMS}-dim)", fontsize=13)

ax = axes[0]
ax.scatter(df.loc[df["position_level"] == "Unknown", "umap_x"],
           df.loc[df["position_level"] == "Unknown", "umap_y"],
           c="#EEEEEE", s=1, alpha=0.1, linewidths=0, rasterized=True)
for pl, color in PL_PALETTE.items():
    if pl == "Unknown":
        continue
    sub = df[df["position_level"] == pl]
    if len(sub) == 0:
        continue
    ax.scatter(sub["umap_x"], sub["umap_y"], c=color, s=2, alpha=0.5, linewidths=0,
               label=f"{pl} (n={len(sub):,})", rasterized=True)
ax.legend(fontsize=7, loc="lower right", markerscale=3)
ax.set_title("Coloured by position_level", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

ax = axes[1]
has_exp = df["min_years_experience"].notna()
ax.scatter(df.loc[~has_exp, "umap_x"], df.loc[~has_exp, "umap_y"],
           c="#EEEEEE", s=1, alpha=0.1, linewidths=0, rasterized=True)
sc = ax.scatter(df.loc[has_exp, "umap_x"], df.loc[has_exp, "umap_y"],
                c=df.loc[has_exp, "min_years_experience"],
                cmap="plasma", s=2, alpha=0.5, vmin=0, vmax=10,
                linewidths=0, rasterized=True)
plt.colorbar(sc, ax=ax, label="min_years_experience")
ax.set_title("Coloured by years experience", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

ax = axes[2]
has_sal = df["salary_min"].notna() & (df["salary_min"] > 0)
ax.scatter(df.loc[~has_sal, "umap_x"], df.loc[~has_sal, "umap_y"],
           c="#EEEEEE", s=1, alpha=0.1, linewidths=0, rasterized=True)
sc2 = ax.scatter(df.loc[has_sal, "umap_x"], df.loc[has_sal, "umap_y"],
                 c=np.log1p(df.loc[has_sal, "salary_min"]),
                 cmap="viridis", s=2, alpha=0.5, linewidths=0, rasterized=True)
plt.colorbar(sc2, ax=ax, label="log(salary_min+1)")
ax.set_title("Coloured by salary_min", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "umap_overview.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {OUTPUT_DIR}/umap_overview.png")

# ── Section 3: Silhouette sweep ───────────────────────────────────────────────
print("\n=== Section 3: Silhouette sweep k=8..25 ===")

SIL_SAMPLE = 10_000
K_RANGE = range(8, 26)
sil_idx = rng.choice(len(X), size=min(SIL_SAMPLE, len(X)), replace=False)
X_sil = X[sil_idx]

silhouette_scores: dict[int, float] = {}
for k in K_RANGE:
    km_tmp = MiniBatchKMeans(n_clusters=k, random_state=42, n_init=5, batch_size=4096)
    km_tmp.fit(X)
    labels_sil = km_tmp.labels_[sil_idx]
    score = silhouette_score(X_sil, labels_sil, metric="cosine")
    silhouette_scores[k] = score
    print(f"  k={k:2d}  silhouette={score:.4f}")

best_k = max(silhouette_scores, key=silhouette_scores.get)
print(f"\nBest k = {best_k}  (silhouette = {silhouette_scores[best_k]:.4f})")
print("(v1 baseline: best_k=20, silhouette≈0.054)")

fig, ax = plt.subplots(figsize=(10, 4))
ks = list(silhouette_scores.keys())
scores = list(silhouette_scores.values())
ax.plot(ks, scores, marker="o", linewidth=1.5)
ax.axvline(best_k, color="red", linestyle="--", label=f"Best k={best_k}")
ax.set_xlabel("k"); ax.set_ylabel("Silhouette score (cosine)")
ax.set_title(f"K-Means silhouette sweep — {MODEL_NAME}")
ax.legend()
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "silhouette_sweep.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {OUTPUT_DIR}/silhouette_sweep.png")

# ── Section 4: Final K-Means + cluster profiles ───────────────────────────────
print(f"\n=== Section 4: Final K-Means k={best_k} ===")

km = MiniBatchKMeans(n_clusters=best_k, random_state=42, n_init=10, batch_size=4096)
km.fit(X)
df["kmeans_cluster"] = km.labels_

cluster_profiles = []
for c in range(best_k):
    sub = df[df["kmeans_cluster"] == c]
    profile = {
        "cluster":           c,
        "n":                 len(sub),
        "salary_min_median": float(sub["salary_min"].median()) if sub["salary_min"].notna().any() else None,
        "salary_max_median": float(sub["salary_max"].median()) if sub["salary_max"].notna().any() else None,
        "years_exp_median":  float(sub["min_years_experience"].median()) if sub["min_years_experience"].notna().any() else None,
        "top_titles":        sub["title"].value_counts().head(5).to_dict(),
        "top_categories":    sub["category"].value_counts().head(5).to_dict(),
        "top_levels":        sub["position_level"].value_counts().head(5).to_dict(),
    }
    cluster_profiles.append(profile)

cluster_profiles.sort(key=lambda p: p["salary_min_median"] or 0)
print(f"\n{'C':>3}  {'n':>6}  {'SalMin':>8}  {'SalMax':>8}  {'YrsExp':>6}  Top level")
print("-" * 70)
for p in cluster_profiles:
    top_lvl = list(p["top_levels"].keys())[0] if p["top_levels"] else "—"
    print(f"{p['cluster']:>3}  {p['n']:>6,}  "
          f"{(p['salary_min_median'] or 0):>8,.0f}  "
          f"{(p['salary_max_median'] or 0):>8,.0f}  "
          f"{(p['years_exp_median'] or 0):>6.1f}  {top_lvl}")

# ── Section 5: Cluster purity ─────────────────────────────────────────────────
print("\n=== Section 5: Cluster purity ===")

labeled = df[df["position_level"] != "Unknown"].copy()
print(f"Labeled jobs: {len(labeled):,} ({len(labeled)/len(df)*100:.1f}%)\n")

print(f"{'Position Level':<24}  {'n':>6}  {'Dom. Cluster':>12}  {'Purity':>7}")
print("-" * 58)

purity_rows = []
for pl in labeled["position_level"].value_counts().index:
    sub = labeled[labeled["position_level"] == pl]
    vc  = sub["kmeans_cluster"].value_counts()
    dom_cluster = vc.index[0]
    purity = vc.iloc[0] / len(sub)
    print(f"{pl:<24}  {len(sub):>6,}  {dom_cluster:>12}  {purity:>7.3f}")
    purity_rows.append({"position_level": pl, "n": len(sub), "purity": purity})

mean_purity = np.mean([r["purity"] for r in purity_rows])
print(f"\nMean purity:              {mean_purity:.3f}")
print(f"Random baseline (1/{best_k}): {1/best_k:.3f}")
print(f"v1 baseline (BGE-small):  0.164")
print(f"Improvement vs v1:        {mean_purity - 0.164:+.3f}")

# ── Section 6: KNN tier propagation ──────────────────────────────────────────
print("\n=== Section 6: KNN tier propagation ===")

TIER_MAP = {
    "Fresh/entry level":  "T1_Entry",
    "Non-executive":      "T1_Entry",
    "Junior Executive":   "T2_Junior",
    "Executive":          "T2_Junior",
    "Professional":       "T3_Senior",
    "Senior Executive":   "T3_Senior",
    "Manager":            "T4_Management",
    "Middle Management":  "T4_Management",
    "Senior Management":  "T4_Management",
    "C-Suite/VP":         "T4_Management",
}

labeled_tiered = labeled.copy()
labeled_tiered["tier"] = labeled_tiered["position_level"].map(TIER_MAP)
labeled_tiered = labeled_tiered[labeled_tiered["tier"].notna()].copy()
labeled_idx = labeled_tiered.index.tolist()
X_labeled = X[labeled_idx]
y_labeled = np.array(labeled_tiered["tier"].tolist())

print(f"Labeled training samples: {len(X_labeled):,}")
print(pd.Series(y_labeled).value_counts().to_string())

knn = KNeighborsClassifier(n_neighbors=5, metric="cosine", algorithm="brute", n_jobs=1)
print("\nRunning 5-fold cross-validation (balanced_accuracy)...")
cv_scores = cross_val_score(knn, X_labeled, y_labeled, cv=5, scoring="balanced_accuracy", n_jobs=1)
print(f"CV balanced_accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
print(f"Per fold: {cv_scores.round(3)}")
print(f"v1 baseline: ~0.35")
print(f"Improvement vs v1: {cv_scores.mean() - 0.35:+.3f}")

print("\nFitting KNN on all labeled examples...")
knn.fit(X_labeled, y_labeled)
print("Predicting tiers for all jobs...")
df["predicted_tier"]       = knn.predict(X)
df["predicted_tier_proba"] = knn.predict_proba(X).max(axis=1)

print("\n=== Predicted Tier Distribution ===")
print(df["predicted_tier"].value_counts().to_string())
print(f"\nMean prediction confidence: {df['predicted_tier_proba'].mean():.3f}")

TIER_COLORS = {
    "T1_Entry":      "#2196F3",
    "T2_Junior":     "#4CAF50",
    "T3_Senior":     "#FF9800",
    "T4_Management": "#F44336",
}

fig, axes = plt.subplots(1, 3, figsize=(22, 7))
fig.suptitle(f"KNN Tier Propagation — {MODEL_NAME} ({EMBEDDING_DIMS}-dim)", fontsize=13)

ax = axes[0]
for tier, color in TIER_COLORS.items():
    mask = df["predicted_tier"] == tier
    ax.scatter(df.loc[mask, "umap_x"], df.loc[mask, "umap_y"],
               c=color, s=1, alpha=0.3, linewidths=0,
               label=f"{tier} (n={mask.sum():,})", rasterized=True)
ax.legend(fontsize=8, loc="lower right", markerscale=4)
ax.set_title("Predicted Tier (all jobs)", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

ax = axes[1]
sc = ax.scatter(df["umap_x"], df["umap_y"],
                c=df["predicted_tier_proba"], cmap="RdYlGn",
                s=1, alpha=0.3, vmin=0.3, vmax=1.0, linewidths=0, rasterized=True)
plt.colorbar(sc, ax=ax, label="Max class probability")
ax.set_title("Prediction Confidence", fontsize=11)
ax.set_xlabel("UMAP-1"); ax.set_ylabel("UMAP-2")

ax = axes[2]
tier_order = ["T1_Entry", "T2_Junior", "T3_Senior", "T4_Management"]
sal_data = [
    df.loc[(df["predicted_tier"] == t) & df["salary_min"].notna(), "salary_min"].values
    for t in tier_order
]
bp = ax.boxplot(sal_data, labels=tier_order, patch_artist=True, showfliers=False)
for patch, color in zip(bp["boxes"], TIER_COLORS.values()):
    patch.set_facecolor(color)
    patch.set_alpha(0.7)
ax.set_ylabel("salary_min (SGD/month)")
ax.set_title("Salary distribution by predicted tier", fontsize=11)

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "knn_tier_propagation.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {OUTPUT_DIR}/knn_tier_propagation.png")

# ── Section 7: Save artifacts ─────────────────────────────────────────────────
print("\n=== Section 7: Saving artifacts ===")

with open(OUTPUT_DIR / "kmeans_model_v2.pkl", "wb") as f:
    pickle.dump(km, f)

with open(OUTPUT_DIR / "knn_tier_classifier_v2.pkl", "wb") as f:
    pickle.dump(knn, f)

for profile in cluster_profiles:
    c = profile["cluster"]
    sub = df[df["kmeans_cluster"] == c]
    profile["predicted_tier_distribution"] = sub["predicted_tier"].value_counts().to_dict()
    profile["dominant_predicted_tier"] = sub["predicted_tier"].value_counts().idxmax()

with open(OUTPUT_DIR / "cluster_profiles_v2.json", "w") as f:
    json.dump(cluster_profiles, f, indent=2)

summary = {
    "model": MODEL_NAME,
    "dims": EMBEDDING_DIMS,
    "total_jobs": len(df),
    "labeled_jobs": int((df["position_level"] != "Unknown").sum()),
    "best_k": best_k,
    "best_silhouette": round(silhouette_scores[best_k], 4),
    "mean_cluster_purity": round(mean_purity, 4),
    "knn_cv_balanced_accuracy_mean": round(float(cv_scores.mean()), 4),
    "knn_cv_balanced_accuracy_std":  round(float(cv_scores.std()), 4),
    "predicted_tier_distribution": df["predicted_tier"].value_counts().to_dict(),
    "mean_prediction_confidence": round(float(df["predicted_tier_proba"].mean()), 4),
    "v1_baseline_mean_purity": 0.164,
    "v1_baseline_knn_cv": 0.35,
    "purity_improvement": round(mean_purity - 0.164, 4),
    "knn_improvement": round(float(cv_scores.mean()) - 0.35, 4),
}

with open(OUTPUT_DIR / "summary_v2.json", "w") as f:
    json.dump(summary, f, indent=2)

print("\n=== FINAL SUMMARY ===")
print(json.dumps(summary, indent=2))
print("\nDone.")
