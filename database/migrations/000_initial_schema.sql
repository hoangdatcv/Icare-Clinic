
SET NAMES utf8mb4;
-- Các bảng nghiệp vụ.

CREATE TABLE IF NOT EXISTS `ai` (
  `idAI` int NOT NULL AUTO_INCREMENT,
  `duLieuBenh` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idAI`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hoatdong` (
  `idHoatDong` int NOT NULL AUTO_INCREMENT,
  `loaiHoatDong` varchar(50) NOT NULL,
  `moTa` text NOT NULL,
  `thoiGian` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `idNguoiThucHien` int DEFAULT NULL,
  PRIMARY KEY (`idHoatDong`),
  KEY `idx_thoiGian` (`thoiGian` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `khachhang` (
  `idKH` int NOT NULL AUTO_INCREMENT,
  `hoTen` varchar(255) DEFAULT NULL,
  `sdt` varchar(11) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `emailVerifiedAt` datetime DEFAULT NULL,
  `matKhau` varchar(255) DEFAULT NULL,
  `ngayThangNamSinh` date DEFAULT NULL,
  `gioiTinh` varchar(50) DEFAULT NULL,
  `CCCD` varchar(12) DEFAULT NULL,
  `diaChi` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idKH`),
  UNIQUE KEY `uq_khachhang_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hosoyte` (
  `idHoSoYTe` int NOT NULL AUTO_INCREMENT,
  `idKH` int DEFAULT NULL,
  PRIMARY KEY (`idHoSoYTe`),
  KEY `idKH` (`idKH`),
  CONSTRAINT `hosoyte_ibfk_1` FOREIGN KEY (`idKH`) REFERENCES `khachhang` (`idKH`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `khoa` (
  `idKhoa` int NOT NULL AUTO_INCREMENT,
  `tenKhoa` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idKhoa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `bacsi` (
  `idBacSi` int NOT NULL AUTO_INCREMENT,
  `hoTenBacSi` varchar(255) DEFAULT NULL,
  `hocVi` varchar(255) DEFAULT NULL,
  `idKhoa` int DEFAULT NULL,
  PRIMARY KEY (`idBacSi`),
  KEY `idKhoa` (`idKhoa`),
  CONSTRAINT `bacsi_ibfk_1` FOREIGN KEY (`idKhoa`) REFERENCES `khoa` (`idKhoa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `lichkham` (
  `idLichKham` int NOT NULL AUTO_INCREMENT,
  `hoTen` varchar(255) NOT NULL,
  `lyDo` text,
  `ngayKham` date NOT NULL,
  `gioKham` time NOT NULL,
  `idKH` int DEFAULT NULL,
  `idBacSi` int NOT NULL,
  `idKhoa` int NOT NULL,
  `trangThai` enum('chờ xác nhận','đã xác nhận','từ chối','đã hủy') DEFAULT 'chờ xác nhận',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `tenBacSi` varchar(255) DEFAULT NULL,
  `tenKhoa` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idLichKham`),
  KEY `idKH` (`idKH`),
  KEY `idBacSi` (`idBacSi`),
  KEY `idKhoa` (`idKhoa`),
  CONSTRAINT `lichkham_ibfk_1` FOREIGN KEY (`idKH`) REFERENCES `khachhang` (`idKH`),
  CONSTRAINT `lichkham_ibfk_2` FOREIGN KEY (`idBacSi`) REFERENCES `bacsi` (`idBacSi`),
  CONSTRAINT `lichkham_ibfk_3` FOREIGN KEY (`idKhoa`) REFERENCES `khoa` (`idKhoa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `lichsukhambenh` (
  `idLS` int NOT NULL AUTO_INCREMENT,
  `ngayKham` date DEFAULT NULL,
  `ketLuan` varchar(255) DEFAULT NULL,
  `chiTiet` varchar(255) DEFAULT NULL,
  `idBacSi` int DEFAULT NULL,
  `idKhoa` int DEFAULT NULL,
  `idHoSoYTe` int DEFAULT NULL,
  PRIMARY KEY (`idLS`),
  KEY `idBacSi` (`idBacSi`),
  KEY `idKhoa` (`idKhoa`),
  KEY `idHoSoYTe` (`idHoSoYTe`),
  CONSTRAINT `lichsukhambenh_ibfk_1` FOREIGN KEY (`idBacSi`) REFERENCES `bacsi` (`idBacSi`),
  CONSTRAINT `lichsukhambenh_ibfk_2` FOREIGN KEY (`idKhoa`) REFERENCES `khoa` (`idKhoa`),
  CONSTRAINT `lichsukhambenh_ibfk_3` FOREIGN KEY (`idHoSoYTe`) REFERENCES `hosoyte` (`idHoSoYTe`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `lienhe` (
  `idLienHe` int NOT NULL AUTO_INCREMENT,
  `diaChiBV` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `sdtBV` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`idLienHe`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `quantrivien` (
  `idQTV` int NOT NULL AUTO_INCREMENT,
  `sdtQTV` varchar(10) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `emailVerifiedAt` datetime DEFAULT NULL,
  `matKhauQTV` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idQTV`),
  UNIQUE KEY `uq_quantrivien_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
