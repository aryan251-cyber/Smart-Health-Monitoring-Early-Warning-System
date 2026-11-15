package com.vitalwatch.cases.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Entity representing a Case Follow-up (Feature #14).
 * Displayed as "Case #1024" style ID.
 */
@Entity
@Table(name = "case_followups")
public class CaseFollowUp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "patient_name", nullable = false)
    private String patientName = "Anonymous";

    @Column(nullable = false)
    private String village;

    @Column(name = "reported_date", nullable = false)
    private LocalDate reportedDate;

    @Column(columnDefinition = "TEXT")
    private String symptoms; // e.g. "Fever, Diarrhea, Vomiting"

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CaseStatus status = CaseStatus.REPORTED;

    @Column(name = "follow_up_date")
    private LocalDate followUpDate;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public CaseFollowUp() {
    }

    public CaseFollowUp(String patientName, String village, LocalDate reportedDate, String symptoms, CaseStatus status, LocalDate followUpDate) {
        this.patientName = (patientName == null || patientName.trim().isEmpty()) ? "Anonymous" : patientName.trim();
        this.village = village;
        this.reportedDate = reportedDate;
        this.symptoms = symptoms;
        this.status = status != null ? status : CaseStatus.REPORTED;
        this.followUpDate = followUpDate;
        this.createdAt = LocalDateTime.now();
    }

    // Custom helper for display
    public String getCaseNumber() {
        return "Case #" + (id != null ? id : "");
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPatientName() {
        return patientName;
    }

    public void setPatientName(String patientName) {
        this.patientName = (patientName == null || patientName.trim().isEmpty()) ? "Anonymous" : patientName.trim();
    }

    public String getVillage() {
        return village;
    }

    public void setVillage(String village) {
        this.village = village;
    }

    public LocalDate getReportedDate() {
        return reportedDate;
    }

    public void setReportedDate(LocalDate reportedDate) {
        this.reportedDate = reportedDate;
    }

    public String getSymptoms() {
        return symptoms;
    }

    public void setSymptoms(String symptoms) {
        this.symptoms = symptoms;
    }

    public CaseStatus getStatus() {
        return status;
    }

    public void setStatus(CaseStatus status) {
        this.status = status;
    }

    public LocalDate getFollowUpDate() {
        return followUpDate;
    }

    public void setFollowUpDate(LocalDate followUpDate) {
        this.followUpDate = followUpDate;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}

