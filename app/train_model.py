import os
from pathlib import Path
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
from sklearn.model_selection import train_test_split

def generate_synthetic_vitals(n_samples=3500, random_state=42):
    """
    Generates realistic clinical vitals across three categories:
    0: NORMAL
    1: WARNING
    2: CRITICAL
    Features: [heart_rate, spo2, systolic_bp, diastolic_bp, temperature, respiratory_rate, glucose]
    """
    np.random.seed(random_state)
    n_per_class = n_samples // 3

    # 1. NORMAL (Class 0)
    hr_normal = np.random.normal(72, 8, n_per_class).clip(55, 88)
    spo2_normal = np.random.uniform(96.0, 99.5, n_per_class)
    sbp_normal = np.random.normal(118, 9, n_per_class).clip(102, 135)
    dbp_normal = np.random.normal(74, 6, n_per_class).clip(62, 86)
    temp_normal = np.random.normal(36.7, 0.3, n_per_class).clip(36.2, 37.3)
    resp_normal = np.random.normal(15, 2, n_per_class).clip(12, 19)
    gluc_normal = np.random.normal(95, 12, n_per_class).clip(72, 130)
    X_normal = np.column_stack([hr_normal, spo2_normal, sbp_normal, dbp_normal, temp_normal, resp_normal, gluc_normal])
    y_normal = np.zeros(n_per_class, dtype=int)

    # 2. WARNING (Class 1) - Borderline / Stage 1 HTN / Mild Fever / Mild Tachycardia / Low SpO2
    hr_low_warn = np.random.uniform(43, 49, n_per_class // 2)
    hr_high_warn = np.random.uniform(92, 115, n_per_class - len(hr_low_warn))
    hr_warn = np.concatenate([hr_low_warn, hr_high_warn])
    np.random.shuffle(hr_warn)
    spo2_warn = np.random.uniform(92.0, 95.5, n_per_class)
    sbp_warn = np.random.uniform(142, 165, n_per_class)
    dbp_warn = np.random.uniform(90, 102, n_per_class)
    temp_warn = np.random.uniform(37.6, 38.4, n_per_class)
    resp_warn = np.random.uniform(21, 24, n_per_class)
    gluc_warn = np.random.uniform(142, 195, n_per_class)
    X_warn = np.column_stack([hr_warn, spo2_warn, sbp_warn, dbp_warn, temp_warn, resp_warn, gluc_warn])
    y_warn = np.ones(n_per_class, dtype=int)

    # 3. CRITICAL (Class 2) - Hypoxemia / Shock / Hypertensive Crisis / High Pyrexia / Severe Tachycardia
    crit_patterns = np.random.randint(0, 4, n_per_class)
    hr_crit = np.zeros(n_per_class)
    spo2_crit = np.zeros(n_per_class)
    sbp_crit = np.zeros(n_per_class)
    dbp_crit = np.zeros(n_per_class)
    temp_crit = np.zeros(n_per_class)
    resp_crit = np.zeros(n_per_class)
    gluc_crit = np.zeros(n_per_class)

    for i in range(n_per_class):
        pattern = crit_patterns[i]
        if pattern == 0:  # Severe Hypoxia / Respiratory failure
            spo2_crit[i] = np.random.uniform(75.0, 89.5)
            resp_crit[i] = np.random.uniform(26.0, 36.0)
            hr_crit[i] = np.random.uniform(115.0, 145.0)
            sbp_crit[i] = np.random.uniform(95.0, 140.0)
            dbp_crit[i] = np.random.uniform(60.0, 90.0)
            temp_crit[i] = np.random.uniform(36.5, 38.0)
            gluc_crit[i] = np.random.uniform(90.0, 140.0)
        elif pattern == 1:  # Sepsis / Severe infection
            temp_crit[i] = np.random.uniform(38.8, 40.5)
            hr_crit[i] = np.random.uniform(120.0, 150.0)
            resp_crit[i] = np.random.uniform(25.0, 32.0)
            spo2_crit[i] = np.random.uniform(88.0, 94.0)
            sbp_crit[i] = np.random.uniform(80.0, 105.0)
            dbp_crit[i] = np.random.uniform(50.0, 68.0)
            gluc_crit[i] = np.random.uniform(140.0, 220.0)
        elif pattern == 2:  # Hypertensive crisis / Cardiac distress
            sbp_crit[i] = np.random.uniform(180.0, 220.0)
            dbp_crit[i] = np.random.uniform(105.0, 130.0)
            hr_crit[i] = np.random.uniform(105.0, 140.0)
            spo2_crit[i] = np.random.uniform(92.0, 97.0)
            temp_crit[i] = np.random.uniform(36.5, 37.5)
            resp_crit[i] = np.random.uniform(18.0, 26.0)
            gluc_crit[i] = np.random.uniform(110.0, 180.0)
        else:  # Severe Bradycardia / Hypotension / Shock
            hr_crit[i] = np.random.uniform(32.0, 40.0)
            sbp_crit[i] = np.random.uniform(70.0, 88.0)
            dbp_crit[i] = np.random.uniform(40.0, 52.0)
            spo2_crit[i] = np.random.uniform(88.0, 93.0)
            temp_crit[i] = np.random.uniform(34.8, 36.0)
            resp_crit[i] = np.random.uniform(7.0, 11.0)
            gluc_crit[i] = np.random.uniform(50.0, 85.0)

    X_crit = np.column_stack([hr_crit, spo2_crit, sbp_crit, dbp_crit, temp_crit, resp_crit, gluc_crit])
    y_crit = np.full(n_per_class, 2, dtype=int)

    # Combine and shuffle
    X = np.vstack([X_normal, X_warn, X_crit])
    y = np.concatenate([y_normal, y_warn, y_crit])

    indices = np.arange(len(y))
    np.random.shuffle(indices)
    return X[indices], y[indices]


def train_and_save_model(output_path=None):
    """
    Generates synthetic data, trains RandomForest, and saves model artifact.
    """
    if output_path is None:
        base_dir = Path(__file__).resolve().parent.parent
        output_dir = base_dir / "model"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "vitalwatch_rf.joblib"
    else:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

    print("[ML Training] Generating synthetic clinical dataset...")
    X, y = generate_synthetic_vitals(n_samples=3600, random_state=42)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"[ML Training] Training RandomForest on {len(X_train)} samples...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        min_samples_split=4,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"[ML Training] Model Accuracy on test set: {acc * 100:.2f}%")
    print("[ML Training] Classification Report:\n", classification_report(y_test, y_pred, target_names=["NORMAL", "WARNING", "CRITICAL"]))

    joblib.dump(clf, output_path)
    print(f"[ML Training] Saved model artifact to: {output_path}")
    return output_path


if __name__ == "__main__":
    train_and_save_model()
