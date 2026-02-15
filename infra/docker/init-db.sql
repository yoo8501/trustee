-- 수탁사 관리 시스템 - 데이터베이스 초기화
-- 서비스별 별도 데이터베이스 생성

CREATE DATABASE IF NOT EXISTS trustee_db;
CREATE DATABASE IF NOT EXISTS inspection_db;

-- 사용자 권한 부여
GRANT ALL PRIVILEGES ON trustee_db.* TO 'trustee'@'%';
GRANT ALL PRIVILEGES ON inspection_db.* TO 'trustee'@'%';
FLUSH PRIVILEGES;
