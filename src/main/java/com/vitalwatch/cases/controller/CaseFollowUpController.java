package com.vitalwatch.cases.controller;

import com.vitalwatch.cases.model.CaseFollowUp;
import com.vitalwatch.cases.model.CaseStatus;
import com.vitalwatch.cases.service.CaseFollowUpService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * REST Controller for Case Follow-up (Feature #14).
 *
 * Endpoints:
 *   POST   /api/cases          -> create case (default status REPORTED)
 *   GET    /api/cases          -> list all (optional ?status= filter)
 *   GET    /api/cases/{id}     -> single case
 *   PUT    /api/cases/{id}     -> edit follow-up date / details
 *   PATCH  /api/cases/{id}/status -> update status (forward-only flow)
 *   DELETE /api/cases/{id}     -> delete
 */
@RestController
@RequestMapping("/api/cases")
@CrossOrigin(origins = "*")
public class CaseFollowUpController {

    private final CaseFollowUpService service;

    public CaseFollowUpController(CaseFollowUpService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<CaseFollowUp>> getAllCases(@RequestParam(value = "status", required = false) String statusStr) {
        CaseStatus status = null;
        if (statusStr != null && !statusStr.trim().isEmpty()) {
            try {
                status = CaseStatus.valueOf(statusStr.trim().toUpperCase().replace(" ", "_"));
            } catch (IllegalArgumentException ignored) {
            }
        }
        return ResponseEntity.ok(service.getAllCases(status));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getCaseById(@PathVariable @NonNull Long id) {
        return service.getCaseById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Case #" + id + " not found")));
    }

    @PostMapping
    public ResponseEntity<?> createCase(@RequestBody Map<String, Object> body) {
        try {
            String village = (String) body.get("village");
            String patientName = (String) body.getOrDefault("patientName", body.get("patient_name"));
            String reportedDateStr = (String) body.getOrDefault("reportedDate", body.get("reported_date"));
            String followUpDateStr = (String) body.getOrDefault("followUpDate", body.get("follow_up_date"));

            Object symptomsObj = body.get("symptoms");
            String symptoms = null;
            if (symptomsObj instanceof List<?>) {
                symptoms = String.join(", ", ((List<?>) symptomsObj).stream().map(String::valueOf).toList());
            } else if (symptomsObj != null) {
                symptoms = symptomsObj.toString();
            }

            LocalDate reportedDate = (reportedDateStr != null && !reportedDateStr.isEmpty()) ? LocalDate.parse(reportedDateStr) : null;
            LocalDate followUpDate = (followUpDateStr != null && !followUpDateStr.isEmpty()) ? LocalDate.parse(followUpDateStr) : null;

            CaseFollowUp created = service.createCase(patientName, village, reportedDate, symptoms, followUpDate);
            return ResponseEntity.status(HttpStatus.CREATED).body(created);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateDetails(@PathVariable @NonNull Long id, @RequestBody Map<String, Object> body) {
        try {
            String village = (String) body.get("village");
            String patientName = (String) body.getOrDefault("patientName", body.get("patient_name"));
            String reportedDateStr = (String) body.getOrDefault("reportedDate", body.get("reported_date"));
            String followUpDateStr = (String) body.getOrDefault("followUpDate", body.get("follow_up_date"));

            Object symptomsObj = body.get("symptoms");
            String symptoms = null;
            if (symptomsObj instanceof List<?>) {
                symptoms = String.join(", ", ((List<?>) symptomsObj).stream().map(String::valueOf).toList());
            } else if (symptomsObj != null) {
                symptoms = symptomsObj.toString();
            }

            LocalDate reportedDate = (reportedDateStr != null && !reportedDateStr.isEmpty()) ? LocalDate.parse(reportedDateStr) : null;
            LocalDate followUpDate = (followUpDateStr != null && !followUpDateStr.isEmpty()) ? LocalDate.parse(followUpDateStr) : null;

            CaseFollowUp updated = service.updateDetails(id, patientName, village, reportedDate, symptoms, followUpDate);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable @NonNull Long id, @RequestBody Map<String, String> body) {
        String statusStr = body.get("status");
        if (statusStr == null || statusStr.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "status is required"));
        }
        try {
            CaseStatus target = CaseStatus.valueOf(statusStr.trim().toUpperCase().replace(" ", "_"));
            CaseFollowUp updated = service.updateStatus(id, target);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status value: " + statusStr));
        } catch (IllegalStateException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteCase(@PathVariable @NonNull Long id) {
        try {
            service.deleteCase(id);
            return ResponseEntity.ok(Map.of("message", "Case #" + id + " deleted successfully", "id", id));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
        }
    }
}

