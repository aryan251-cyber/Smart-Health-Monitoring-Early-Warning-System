package com.vitalwatch.cases.model;

/**
 * Status enum for Case Follow-up (Feature #14).
 * Flow is forward-only: REPORTED -> UNDER_OBSERVATION -> REFERRED -> RECOVERED
 */
public enum CaseStatus {
    REPORTED(0),
    UNDER_OBSERVATION(1),
    REFERRED(2),
    RECOVERED(3);

    private final int rank;

    CaseStatus(int rank) {
        this.rank = rank;
    }

    public int getRank() {
        return rank;
    }

    public boolean canTransitionTo(CaseStatus target) {
        if (target == null) return false;
        // Cannot transition from terminal RECOVERED state
        if (this == RECOVERED) return false;
        // Forward-only: rank must strictly increase
        // (Allows skipping REFERRED directly to RECOVERED)
        return target.getRank() > this.getRank();
    }
}

