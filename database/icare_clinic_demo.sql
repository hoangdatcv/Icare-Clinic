-- Chuyên khoa và bác sĩ mẫu.
SET NAMES utf8mb4;
SET @icare_seed_demo = 0;

START TRANSACTION;

SET @icare_seed_demo = (
  NOT EXISTS (SELECT 1 FROM khoa LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM bacsi LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM khachhang LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM quantrivien LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM hosoyte LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM lichkham LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM lichsukhambenh LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM hoatdong LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM lienhe LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM ai LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM app_sessions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM account_email_tokens LIMIT 1)
);

INSERT INTO khoa (idKhoa, tenKhoa)
SELECT mau.idKhoa, mau.tenKhoa
FROM (
  SELECT 1 AS idKhoa, 'Nội tổng quát' AS tenKhoa
  UNION ALL SELECT 2, 'Nhi khoa'
  UNION ALL SELECT 3, 'Tim mạch'
  UNION ALL SELECT 4, 'Da liễu'
  UNION ALL SELECT 5, 'Tai Mũi Họng'
  UNION ALL SELECT 6, 'Răng Hàm Mặt'
) AS mau
WHERE @icare_seed_demo = 1;

INSERT INTO bacsi (idBacSi, hoTenBacSi, hocVi, idKhoa)
SELECT mau.idBacSi, mau.hoTenBacSi, 'Bác sĩ (mẫu)', mau.idKhoa
FROM (
  SELECT 1 AS idBacSi, 'Bác sĩ mẫu 01' AS hoTenBacSi, 1 AS idKhoa
  UNION ALL SELECT 2, 'Bác sĩ mẫu 02', 1
  UNION ALL SELECT 3, 'Bác sĩ mẫu 03', 2
  UNION ALL SELECT 4, 'Bác sĩ mẫu 04', 2
  UNION ALL SELECT 5, 'Bác sĩ mẫu 05', 3
  UNION ALL SELECT 6, 'Bác sĩ mẫu 06', 3
  UNION ALL SELECT 7, 'Bác sĩ mẫu 07', 4
  UNION ALL SELECT 8, 'Bác sĩ mẫu 08', 4
  UNION ALL SELECT 9, 'Bác sĩ mẫu 09', 5
  UNION ALL SELECT 10, 'Bác sĩ mẫu 10', 5
  UNION ALL SELECT 11, 'Bác sĩ mẫu 11', 6
  UNION ALL SELECT 12, 'Bác sĩ mẫu 12', 6
) AS mau
WHERE @icare_seed_demo = 1;

COMMIT;

SELECT CASE WHEN @icare_seed_demo = 1
  THEN 'Đã tạo 6 chuyên khoa và 12 bác sĩ mẫu.'
  ELSE 'Không thêm dữ liệu mẫu vì database đã có dữ liệu.'
END AS ketQua;
