package com.vitalwatch.cases.service;

import com.vitalwatch.cases.model.CaseFollowUp;
import com.vitalwatch.cases.model.CaseStatus;
import com.vitalwatch.cases.repository.CaseFollowUpRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.lang.NonNull;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class CaseFollowUpService {

    private final CaseFollowUpRepository repository;

    public CaseFollowUpService(CaseFollowUpRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<CaseFollowUp> getAllCases(CaseStatus status) {
        if (status != null) {
            return repository.findByStatusOrderByIdDesc(status);
        }
        return repository.findAllByOrderByIdDesc();
    }

    @Transactional(readOnly = true)
    public Optional<CaseFollowUp> getCaseById(@NonNull Long id) {
        return repository.findById(id);
    }

    public CaseFollowUp createCase(String patientName, String village, LocalDate reportedDate, String symptoms, LocalDate followUpDate) {
        if (village == null || village.trim().isEmpty()) {
            throw new IllegalArgumentException("village is required");
        }
        if (reportedDate == null) {
            throw new IllegalArgumentException("reportedDate is required");
        }

        CaseFollowUp entity = new CaseFollowUp(
                patientName,
                village.trim(),
                reportedDate,
                symptoms,
                CaseStatus.REPORTED,
                followUpDate
        );
        return repository.save(entity);
    }

    public CaseFollowUp updateDetails(@NonNull Long id, String patientName, String village, LocalDate reportedDate, String symptoms, LocalDate followUpDate) {
        CaseFollowUp entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Case #" + id + " not found"));

        if (village != null && !village.trim().isEmpty()) {
            entity.setVillage(village.trim());
        }
        if (patientName != null) {
            entity.setPatientName(patientName);
        }
        if (reportedDate != null) {
            entity.setReportedDate(reportedDate);
        }
        if (symptoms != null) {
            entity.setSymptoms(symptoms);
        }
        if (followUpDate != null) {
            entity.setFollowUpDate(followUpDate);
        }

        return repository.save(entity);
    }

    public CaseFollowUp updateStatus(@NonNull Long id, CaseStatus targetStatus) {
        CaseFollowUp entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Case #" + id + " not found"));

        CaseStatus current = entity.getStatus();
        if (!current.canTransitionTo(targetStatus)) {
            throw new IllegalStateException("Invalid status transition from " + current + " to " + targetStatus +
                    ". Status flow is forward-only (Reported -> Under Observation -> Referred -> Recovered).");
        }

        entity.setStatus(targetStatus);
        return repository.save(entity);
    }

    public void deleteCase(@NonNull Long id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("Case #" + id + " not found");
        }
        repository.deleteById(id);
    }
}

