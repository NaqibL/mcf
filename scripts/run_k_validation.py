"""
K validation: run silhouette sweep with multiple seeds and compare k=20, k=25, k=35 taxonomies.

Steps:
  1. Multi-seed silhouette sweep (k=15..50, 5 seeds) — get mean ± std per k
  2. Fit k=20, k=25, k=35 with best seed, print full taxonomy for each
  3. Print inter-cluster similarity stats per k (how tight are the clusters?)
"""

from __future__ import annotations
import sys
sys.stdout.reconfigure(encoding="utf-8")

import json, warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score

warnings.filterwarnings("ignore")

V2_DIR  = Path("data/analysis_v2")
OUT_DIR = Path("data/analysis_roles")
OUT_DIR.mkdir(exist_ok=True)

# ── Load cached data ──────────────────────────────────────────────────────────
print("Loading cached embeddings + metadata...")
X  = np.load(V2_DIR / "embeddings_X.npy")
df = pd.read_parquet(V2_DIR / "df_meta.parquet")
print(f"Loaded {len(X):,} jobs, {X.shape[1]}-dim")

# ── 1. Multi-seed silhouette sweep k=15..50 ───────────────────────────────────
print("\n=== Multi-seed silhouette sweep (k=15..50, 5 seeds) ===")

SEEDS    = [42, 7, 123, 999, 2024]
K_RANGE  = list(range(15, 51))
SIL_N    = 8_000

rng_base = np.random.default_rng(0)
sil_idx  = rng_base.choice(len(X), size=SIL_N, replace=False)
X_sil    = X[sil_idx]

results: dict[int, list[float]] = {k: [] for k in K_RANGE}

for seed in SEEDS:
    print(f"\n  Seed {seed}:")
    for k in K_RANGE:
        km = MiniBatchKMeans(n_clusters=k, random_state=seed, n_init=3, batch_size=4096)
        km.fit(X)
        score = silhouette_score(X_sil, km.labels_[sil_idx], metric="cosine")
        results[k].append(score)
        print(f"    k={k:>3}: {score:.4f}", end="  ")
    print()

# Compute mean ± std
means = {k: np.mean(v) for k, v in results.items()}
stds  = {k: np.std(v)  for k, v in results.items()}

best_k   = max(means, key=means.get)
best_mean = means[best_k]

print(f"\n{'k':>4}  {'mean':>7}  {'std':>6}  {'min':>7}  {'max':>7}")
print("-" * 40)
for k in K_RANGE:
    marker = " <-- best mean" if k == best_k else ""
    print(f"{k:>4}  {means[k]:.4f}  {stds[k]:.4f}  {min(results[k]):.4f}  {max(results[k]):.4f}{marker}")

# Plot with error bands
fig, ax = plt.subplots(figsize=(14, 5))
ks = K_RANGE
m  = [means[k] for k in ks]
s  = [stds[k]  for k in ks]
ax.plot(ks, m, marker="o", linewidth=1.5, label="mean silhouette")
ax.fill_between(ks, [m[i]-s[i] for i in range(len(ks))],
                    [m[i]+s[i] for i in range(len(ks))], alpha=0.2, label="± 1 std")
ax.axvline(best_k, color="red", linestyle="--", label=f"Best mean k={best_k}")
for candidate in [20, 25, 35]:
    if candidate != best_k:
        ax.axvline(candidate, color="gray", linestyle=":", alpha=0.6, label=f"k={candidate}")
ax.set_xlabel("k"); ax.set_ylabel("Silhouette (cosine)")
ax.set_title(f"K-Means silhouette — 5-seed mean ± std (n={SIL_N:,} sample)")
ax.legend(fontsize=8)
plt.tight_layout()
plt.savefig(OUT_DIR / "k_validation_sweep.png", dpi=150, bbox_inches="tight")
plt.close()
print(f"\nSaved -> {OUT_DIR}/k_validation_sweep.png")

# Candidates: best_k + 20, 25, 35 (deduplicated)
candidates = sorted(set([best_k, 20, 25, 35]))
print(f"\nCandidates to compare: {candidates}")


# ── 2. Fit each candidate and print full taxonomy ─────────────────────────────
def _infer_role_name(all_titles_lower: str, top_titles: dict) -> str:
    rules = [
        (["software engineer","software developer","backend","frontend","full stack","fullstack","embedded software"], "Software Engineering"),
        (["data engineer","ai engineer","cloud engineer","devops engineer","mlops","platform engineer"], "Data Engineering & Cloud / AI"),
        (["data scientist","machine learning","ml engineer","research fellow","research engineer"], "Data Science & Research"),
        (["data analyst","business analyst","system analyst","bi analyst"], "Business & Data Analysis"),
        (["product manager","product owner","product lead","senior product"], "Product Management"),
        (["project manager","project engineer","site engineer","assistant project manager"], "Construction Project Management"),
        (["project coordinator","architectural coordinator","bim coordinator","m&e coordinator"], "Construction Coordination"),
        (["quantity surveyor","senior quantity surveyor","qs "], "Quantity Surveying"),
        (["network engineer","system engineer","it support","cybersecurity","desktop support","it executive"], "IT Infrastructure & Support"),
        (["business development","bd manager","regional manager","general manager"], "Business Development & Strategy"),
        (["sales executive","sales manager","sales engineer","sales coordinator"], "Sales"),
        (["marketing executive","marketing manager","digital marketing","seo","content"], "Marketing & Digital Marketing"),
        (["finance manager","financial consultant","legal counsel","compliance","treasury"], "Finance & Legal"),
        (["accounts executive","accounts assistant","accountant","account executive"], "Accounting & Finance Operations"),
        (["hr executive","hr manager","human resource","talent acquisition","recruiter"], "Human Resources"),
        (["operations executive","customer service executive","customer service officer","procurement"], "Operations & Customer Service"),
        (["staff nurse","enrolled nurse","physiotherapist","occupational therapist","therapy"], "Nursing & Allied Health"),
        (["clinic assistant","dental assistant","pharmacist","clinic executive"], "Healthcare Support & Clinic"),
        (["admin assistant","administrative assistant","personal assistant","admin executive"], "Admin & Secretarial"),
        (["interior designer","bim modeller","drafter","architectural designer","graphic designer"], "Design & Architecture"),
        (["electrical engineer","m&e engineer","service engineer"], "Electrical & M&E Engineering"),
        (["mechanical engineer","process engineer","production operator","mechanical design"], "Mechanical & Manufacturing Engineering"),
        (["technician","maintenance technician","service technician","production technician"], "Technician & Maintenance"),
        (["driver","delivery driver","lorry driver","class 4"], "Drivers & Delivery"),
        (["warehouse assistant","warehouse supervisor","packer","logistics"], "Warehouse & Logistics"),
        (["supervisor","site supervisor","construction supervisor","foreman"], "Site Supervision"),
        (["chef","cook","sous chef","chef de partie","kitchen"], "Kitchen & Culinary"),
        (["service crew","barista","cashier","crew leader"], "F&B Service"),
        (["restaurant manager","bartender","restaurant supervisor"], "F&B Management"),
        (["retail assistant","store manager","storekeeper","retail associate"], "Retail & Store Operations"),
        (["preschool","childcare teacher","student care","infant educator"], "Early Childhood Education"),
        (["teacher","lecturer","trainer","tutor"], "Education & Training"),
        (["security officer","security guard","safety officer","wsh"], "Security & Safety"),
        (["cleaner","housekeeping","room attendant","cleaning"], "Cleaning & Facilities"),
        (["beautician","spa therapist","hairstylist","nail"], "Beauty & Wellness"),
        (["management associate","manager","duty manager","operations manager"], "General Management"),
    ]
    for keywords, name in rules:
        if any(kw in all_titles_lower for kw in keywords):
            return name
    return list(top_titles.keys())[0] if top_titles else "Unknown"


def build_taxonomy(k: int, seed: int = 42) -> list[dict]:
    km = MiniBatchKMeans(n_clusters=k, random_state=seed, n_init=10, batch_size=4096)
    km.fit(X)
    df["_cluster"] = km.labels_
    profiles = []
    for c in range(k):
        sub = df[df["_cluster"] == c]
        top_titles = sub["title"].value_counts().head(8).to_dict()
        top_cats   = sub["category"].value_counts().head(3).to_dict()
        all_t      = " ".join(sub["title"].str.lower().tolist())
        profiles.append({
            "cluster":           c,
            "role_name":         _infer_role_name(all_t, top_titles),
            "n":                 len(sub),
            "salary_min_median": round(float(sub["salary_min"].median()), 0) if sub["salary_min"].notna().any() else None,
            "years_exp_median":  round(float(sub["min_years_experience"].median()), 1) if sub["min_years_experience"].notna().any() else None,
            "top_titles":        list(top_titles.keys())[:5],
            "top_categories":    list(top_cats.keys())[:3],
        })
    profiles.sort(key=lambda p: p["n"], reverse=True)
    return profiles, km


# ── 3. Print taxonomies and inter-cluster similarity stats ────────────────────
summary_rows = []

for k in candidates:
    print(f"\n{'='*70}")
    print(f"  k={k} TAXONOMY")
    print(f"{'='*70}")
    profiles, km_k = build_taxonomy(k)

    print(f"{'C':>3}  {'n':>6}  {'Sal':>7}  {'Yrs':>4}  {'Role Name':<32}  Top titles")
    print("-" * 100)
    for p in profiles:
        titles = " | ".join(p["top_titles"][:3])
        print(f"{p['cluster']:>3}  {p['n']:>6,}  {p['salary_min_median'] or 0:>7,.0f}  "
              f"{p['years_exp_median'] or 0:>4.1f}  {p['role_name']:<32}  {titles}")

    # Inter-cluster similarity stats
    centroids = km_k.cluster_centers_
    norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    c_norm = centroids / np.where(norms > 0, norms, 1)
    sim = c_norm @ c_norm.T
    np.fill_diagonal(sim, np.nan)
    triu = sim[np.triu_indices(k, k=1)]

    # Duplicate role names (same name assigned to multiple clusters)
    role_names = [p["role_name"] for p in profiles]
    from collections import Counter
    dup_names = {name: cnt for name, cnt in Counter(role_names).items() if cnt > 1}

    print(f"\n  Inter-cluster cosine similarity: mean={np.nanmean(triu):.3f}  "
          f"max={np.nanmax(triu):.3f}  min={np.nanmin(triu):.3f}")
    print(f"  Duplicate role names: {dup_names if dup_names else 'none'}")
    print(f"  Mean silhouette (5-seed avg): {means[k]:.4f} +/- {stds[k]:.4f}")

    summary_rows.append({
        "k":                k,
        "mean_silhouette":  round(means[k], 4),
        "std_silhouette":   round(stds[k], 4),
        "inter_sim_mean":   round(float(np.nanmean(triu)), 4),
        "inter_sim_max":    round(float(np.nanmax(triu)), 4),
        "duplicate_names":  dup_names,
    })

# ── 4. Final comparison table ─────────────────────────────────────────────────
print(f"\n{'='*70}")
print("  CANDIDATE COMPARISON")
print(f"{'='*70}")
print(f"{'k':>4}  {'mean_sil':>9}  {'std':>6}  {'inter_mean':>11}  {'inter_max':>10}  Dup names")
print("-" * 70)
for row in summary_rows:
    dups = ", ".join(f"{n}(x{c})" for n, c in row["duplicate_names"].items()) or "—"
    print(f"{row['k']:>4}  {row['mean_silhouette']:>9.4f}  {row['std_silhouette']:>6.4f}  "
          f"{row['inter_sim_mean']:>11.4f}  {row['inter_sim_max']:>10.4f}  {dups}")

with open(OUT_DIR / "k_validation_summary.json", "w") as f:
    json.dump({"sweep_means": {str(k): round(v,4) for k,v in means.items()},
               "sweep_stds":  {str(k): round(v,4) for k,v in stds.items()},
               "candidates":  summary_rows}, f, indent=2)
print(f"\nSaved -> {OUT_DIR}/k_validation_summary.json")
print("\nDone.")
