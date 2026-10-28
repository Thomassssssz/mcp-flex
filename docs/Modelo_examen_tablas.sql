

-- INTEGRANTE 1: Destinos + Paquetes turísticos
CREATE TABLE pre_exam_01_cab_destinos (
    id_preexam01 INT NOT NULL AUTO_INCREMENT,
    preexam01_descripcion VARCHAR(80) NOT NULL,
    preexam01_activo TINYINT(1) NOT NULL DEFAULT 1,
    preexam01_observaciones TEXT NULL,
    PRIMARY KEY (id_preexam01),
    UNIQUE KEY uk_preexam01_descripcion (preexam01_descripcion)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_spanish_ci;

CREATE TABLE pre_exam_02_cab_paquetes (
    id_preexam02 INT NOT NULL AUTO_INCREMENT,
    rela_preexam01 INT NOT NULL,
    preexam02_codigo VARCHAR(20) NOT NULL,
    preexam02_nombre VARCHAR(100) NOT NULL,
    preexam02_email VARCHAR(120) NULL,
    preexam02_fecha_salida DATE NOT NULL,
    preexam02_fecha_regreso DATE NOT NULL,
    preexam02_hora_salida TIME NOT NULL,
    preexam02_cupo INT NOT NULL,
    preexam02_precio_persona DECIMAL(10,2) NOT NULL,
    preexam02_importe_estimado DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    preexam02_regimen TINYINT NOT NULL DEFAULT 1,
    preexam02_activo TINYINT(1) NOT NULL DEFAULT 1,
    preexam02_observaciones TEXT NULL,
    PRIMARY KEY (id_preexam02),
    UNIQUE KEY uk_preexam02_codigo (preexam02_codigo),
    KEY idx_preexam02_relacion (rela_preexam01),
    CONSTRAINT fk_preexam02_preexam01
        FOREIGN KEY (rela_preexam01) REFERENCES pre_exam_01_cab_destinos (id_preexam01)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_spanish_ci;

INSERT INTO pre_exam_01_cab_destinos (preexam01_descripcion, preexam01_activo) VALUES
    ('Cataratas', 1),
    ('Salta', 1),
    ('Bariloche', 0);

-- INTEGRANTE 2: Tipos de traslado + Traslados
CREATE TABLE pre_exam_03_cab_tipos_traslado (
    id_preexam03 INT NOT NULL AUTO_INCREMENT,
    preexam03_descripcion VARCHAR(80) NOT NULL,
    preexam03_activo TINYINT(1) NOT NULL DEFAULT 1,
    preexam03_observaciones TEXT NULL,
    PRIMARY KEY (id_preexam03),
    UNIQUE KEY uk_preexam03_descripcion (preexam03_descripcion)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_spanish_ci;

CREATE TABLE pre_exam_04_cab_traslados (
    id_preexam04 INT NOT NULL AUTO_INCREMENT,
    rela_preexam03 INT NOT NULL,
    preexam04_codigo VARCHAR(20) NOT NULL,
    preexam04_nombre VARCHAR(100) NOT NULL,
    preexam04_email VARCHAR(120) NULL,
    preexam04_fecha_ida DATE NOT NULL,
    preexam04_fecha_vuelta DATE NOT NULL,
    preexam04_hora_recogida TIME NOT NULL,
    preexam04_pasajeros INT NOT NULL,
    preexam04_tarifa_persona DECIMAL(10,2) NOT NULL,
    preexam04_importe_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    preexam04_servicio TINYINT NOT NULL DEFAULT 1,
    preexam04_activo TINYINT(1) NOT NULL DEFAULT 1,
    preexam04_observaciones TEXT NULL,
    PRIMARY KEY (id_preexam04),
    UNIQUE KEY uk_preexam04_codigo (preexam04_codigo),
    KEY idx_preexam04_relacion (rela_preexam03),
    CONSTRAINT fk_preexam04_preexam03
        FOREIGN KEY (rela_preexam03) REFERENCES pre_exam_03_cab_tipos_traslado (id_preexam03)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_spanish_ci;

INSERT INTO pre_exam_03_cab_tipos_traslado (preexam03_descripcion, preexam03_activo) VALUES
    ('Aeropuerto', 1),
    ('Terminal', 1),
    ('Excursión local', 0);
