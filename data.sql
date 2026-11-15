-- ========================================================
-- VitalWatch / ASHA Worker Data Seed (MySQL Compatible)
-- ========================================================

-- 1. Create tables if not exist (matches SQLAlchemy models)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'COMMUNITY_USER',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asha_workers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    phone VARCHAR(20),
    employee_id VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS villages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    district VARCHAR(120) NOT NULL,
    risk_level VARCHAR(10) NOT NULL DEFAULT 'LOW',
    asha_worker_id INT NULL,
    FOREIGN KEY (asha_worker_id) REFERENCES asha_workers(id) ON DELETE SET NULL
);

-- 2. Seed ASHA Worker User (asha@test.com / asha123)
-- BCrypt password hash for 'asha123'
INSERT INTO users (id, full_name, email, password_hash, role, created_at)
VALUES (
    101,
    'Jenia Roy',
    'asha@test.com',
    '$2b$10$syNK9ehHR3iu1h/HYBLFv.R/9Ay10AGfOTapWXcIQ74TGujAUL11q',
    'ASHA_WORKER',
    NOW()
) ON DUPLICATE KEY UPDATE full_name = 'Jenia Roy', role = 'ASHA_WORKER';

-- 3. Seed ASHA Worker Profile
INSERT INTO asha_workers (id, user_id, phone, employee_id)
VALUES (
    1,
    101,
    '9876543210',
    'ASHA-MH-00421'
) ON DUPLICATE KEY UPDATE phone = '9876543210';

-- 4. Seed 5 Assigned Villages with Varied Risk Levels (Gujarat)
INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Rampur', 'Ahmedabad', 'LOW', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Rampur');

INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Devgaon', 'Vadodara', 'MEDIUM', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Devgaon');

INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Sonwadi', 'Rajkot', 'HIGH', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Sonwadi');

INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Khamgaon', 'Surat', 'LOW', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Khamgaon');

INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Bhilwadi', 'Anand', 'HIGH', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Bhilwadi');

INSERT INTO villages (name, district, risk_level, asha_worker_id)
SELECT 'Modhera', 'Mehsana', 'HIGH', 1
WHERE NOT EXISTS (SELECT 1 FROM villages WHERE name = 'Modhera');

-- ========================================================
-- 5. Feature #14: Case Follow-up Table & Sample Seeds
-- ========================================================
CREATE TABLE IF NOT EXISTS case_followups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_name VARCHAR(120) NOT NULL DEFAULT 'Anonymous',
    village VARCHAR(120) NOT NULL,
    reported_date DATE NOT NULL,
    symptoms TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'REPORTED',
    follow_up_date DATE NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO case_followups (id, patient_name, village, reported_date, symptoms, status, follow_up_date)
VALUES
(1024, 'Sunita Devi', 'Rampur', CURDATE() - INTERVAL 3 DAY, 'Fever, Diarrhea, Weakness', 'UNDER_OBSERVATION', CURDATE() + INTERVAL 1 DAY),
(1025, 'Rahul Barman', 'Sonapur', CURDATE() - INTERVAL 5 DAY, 'Vomiting, Dehydration, Abdominal Pain', 'REFERRED', CURDATE()),
(1026, 'Anonymous', 'Bishnupur', CURDATE() - INTERVAL 1 DAY, 'Fever, Weakness', 'REPORTED', CURDATE() + INTERVAL 2 DAY),
(1027, 'Meena Das', 'Kalyanpur', CURDATE() - INTERVAL 7 DAY, 'Fever, Diarrhea', 'RECOVERED', CURDATE() - INTERVAL 1 DAY)
ON DUPLICATE KEY UPDATE patient_name=VALUES(patient_name);

