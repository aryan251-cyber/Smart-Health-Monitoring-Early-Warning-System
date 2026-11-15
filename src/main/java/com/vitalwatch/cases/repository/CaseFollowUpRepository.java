package com.vitalwatch.cases.repository;

import com.vitalwatch.cases.model.CaseFollowUp;
import com.vitalwatch.cases.model.CaseStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CaseFollowUpRepository extends JpaRepository<CaseFollowUp, Long> {

    List<CaseFollowUp> findByStatusOrderByIdDesc(CaseStatus status);

    List<CaseFollowUp> findAllByOrderByIdDesc();
}

