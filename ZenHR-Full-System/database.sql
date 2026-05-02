--
-- PostgreSQL database dump
--

\restrict 9951jQwx6dzCwEfpCstUti8xw9bwEyamSetxToOhILhZEM2jMZxzfcgnlLm4NKE

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id integer NOT NULL,
    type character varying(50) NOT NULL,
    description character varying(500) NOT NULL,
    employee_name character varying(300),
    company_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.activity_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_logs_id_seq OWNER TO postgres;

--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asset_categories (
    id integer NOT NULL,
    name_ar character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.asset_categories OWNER TO postgres;

--
-- Name: asset_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.asset_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.asset_categories_id_seq OWNER TO postgres;

--
-- Name: asset_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.asset_categories_id_seq OWNED BY public.asset_categories.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    company_id integer NOT NULL,
    category_id integer NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    serial_number character varying(100),
    model character varying(100),
    brand character varying(100),
    purchase_date date,
    purchase_value numeric(12,3),
    current_status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    assigned_to_employee_id integer,
    assigned_date date,
    returned_date date,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.assets_id_seq OWNER TO postgres;

--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_records (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    date date NOT NULL,
    clock_in timestamp with time zone,
    clock_out timestamp with time zone,
    worked_minutes integer,
    status character varying(20) DEFAULT 'absent'::character varying NOT NULL,
    late_minutes integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.attendance_records OWNER TO postgres;

--
-- Name: attendance_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_records_id_seq OWNER TO postgres;

--
-- Name: attendance_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_records_id_seq OWNED BY public.attendance_records.id;


--
-- Name: banks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.banks (
    id integer NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    swift_code character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.banks OWNER TO postgres;

--
-- Name: banks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.banks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.banks_id_seq OWNER TO postgres;

--
-- Name: banks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.banks_id_seq OWNED BY public.banks.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name_ar character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    governorate character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cities OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cities_id_seq OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    commercial_reg_no character varying(50),
    tax_number character varying(50),
    ssc_number character varying(50),
    labor_ministry_no character varying(50),
    address_ar text,
    city character varying(100),
    phone character varying(20),
    email character varying(150),
    website character varying(200),
    logo character varying(500),
    industry_type character varying(50) DEFAULT 'other'::character varying,
    currency character varying(10) DEFAULT 'JOD'::character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    code character varying(20),
    parent_department_id integer,
    manager_employee_id integer,
    cost_center_code character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.departments_id_seq OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_types (
    id integer NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    category character varying(50),
    requires_expiry boolean DEFAULT false NOT NULL,
    alert_days_before integer DEFAULT 30 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_types OWNER TO postgres;

--
-- Name: document_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.document_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.document_types_id_seq OWNER TO postgres;

--
-- Name: document_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.document_types_id_seq OWNED BY public.document_types.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    document_type_id integer NOT NULL,
    document_number character varying(100),
    issued_at date,
    expires_at date,
    file_url character varying(500),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.documents_id_seq OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_code character varying(30) NOT NULL,
    first_name_ar character varying(100) NOT NULL,
    middle_name_ar character varying(100),
    last_name_ar character varying(100) NOT NULL,
    first_name_en character varying(100) NOT NULL,
    middle_name_en character varying(100),
    last_name_en character varying(100) NOT NULL,
    gender character varying(10) NOT NULL,
    date_of_birth date NOT NULL,
    national_id character varying(20),
    nationality character varying(100) DEFAULT 'أردني'::character varying,
    religion character varying(20),
    marital_status character varying(20),
    number_of_dependents integer DEFAULT 0 NOT NULL,
    personal_email character varying(150),
    work_email character varying(150),
    personal_phone character varying(20),
    work_phone character varying(20),
    emergency_contact_name character varying(200),
    emergency_contact_phone character varying(20),
    emergency_contact_relation character varying(100),
    address_ar text,
    city character varying(100),
    department_id integer,
    job_title_id integer,
    direct_manager_id integer,
    employment_type character varying(20) DEFAULT 'fulltime'::character varying NOT NULL,
    hire_date date NOT NULL,
    probation_end_date date,
    contract_type character varying(20) DEFAULT 'permanent'::character varying NOT NULL,
    contract_end_date date,
    employment_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    termination_date date,
    termination_reason text,
    basic_salary numeric(12,3) NOT NULL,
    housing_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    transport_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    mobile_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    meal_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    other_allowances numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    ssc_number character varying(20),
    ssc_enrollment_date date,
    is_ssc_exempt boolean DEFAULT false NOT NULL,
    income_tax_number character varying(30),
    tax_exemption_amount numeric(12,3) DEFAULT '0'::numeric,
    bank_name character varying(200),
    bank_account_number character varying(50),
    iban character varying(34),
    passport_number character varying(30),
    passport_expiry date,
    work_permit_number character varying(30),
    work_permit_expiry date,
    residency_number character varying(30),
    residency_expiry date,
    profile_photo character varying(500),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employees_id_seq OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: job_titles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.job_titles (
    id integer NOT NULL,
    company_id integer NOT NULL,
    title_ar character varying(200) NOT NULL,
    title_en character varying(200) NOT NULL,
    job_grade character varying(10),
    min_salary numeric(12,3),
    max_salary numeric(12,3),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.job_titles OWNER TO postgres;

--
-- Name: job_titles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.job_titles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_titles_id_seq OWNER TO postgres;

--
-- Name: job_titles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.job_titles_id_seq OWNED BY public.job_titles.id;


--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_balances (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    leave_policy_id integer NOT NULL,
    year integer NOT NULL,
    entitled_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    used_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    pending_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    carried_forward_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leave_balances OWNER TO postgres;

--
-- Name: leave_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leave_balances_id_seq OWNER TO postgres;

--
-- Name: leave_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_balances_id_seq OWNED BY public.leave_balances.id;


--
-- Name: leave_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_policies (
    id integer NOT NULL,
    company_id integer NOT NULL,
    leave_type character varying(30) NOT NULL,
    name_ar character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    days_per_year numeric(5,2) NOT NULL,
    max_carry_forward_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    min_service_months integer DEFAULT 0 NOT NULL,
    requires_medical_certificate boolean DEFAULT false NOT NULL,
    is_paid boolean DEFAULT true NOT NULL,
    can_be_negative boolean DEFAULT false NOT NULL,
    gender character varying(10) DEFAULT 'all'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.leave_policies OWNER TO postgres;

--
-- Name: leave_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leave_policies_id_seq OWNER TO postgres;

--
-- Name: leave_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_policies_id_seq OWNED BY public.leave_policies.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    leave_type character varying(30) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days numeric(5,2) NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    approved_by_id integer,
    approved_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.leave_requests OWNER TO postgres;

--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leave_requests_id_seq OWNER TO postgres;

--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: leave_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_types (
    id integer NOT NULL,
    name_ar character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    color character varying(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leave_types OWNER TO postgres;

--
-- Name: leave_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leave_types_id_seq OWNER TO postgres;

--
-- Name: leave_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_types_id_seq OWNED BY public.leave_types.id;


--
-- Name: nationalities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nationalities (
    id integer NOT NULL,
    name_ar character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    country_code character varying(5),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.nationalities OWNER TO postgres;

--
-- Name: nationalities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.nationalities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nationalities_id_seq OWNER TO postgres;

--
-- Name: nationalities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.nationalities_id_seq OWNED BY public.nationalities.id;


--
-- Name: overtime_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.overtime_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    date date NOT NULL,
    hours numeric(5,2) NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    manager_approved_by_id integer,
    manager_approved_at timestamp with time zone,
    hr_approved_by_id integer,
    hr_approved_at timestamp with time zone,
    rejection_reason text,
    linked_payslip_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.overtime_requests OWNER TO postgres;

--
-- Name: overtime_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.overtime_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.overtime_requests_id_seq OWNER TO postgres;

--
-- Name: overtime_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.overtime_requests_id_seq OWNED BY public.overtime_requests.id;


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_runs (
    id integer NOT NULL,
    company_id integer NOT NULL,
    run_month integer NOT NULL,
    run_year integer NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    total_gross numeric(14,3) DEFAULT '0'::numeric NOT NULL,
    total_net numeric(14,3) DEFAULT '0'::numeric NOT NULL,
    total_deductions numeric(14,3) DEFAULT '0'::numeric NOT NULL,
    employee_count integer DEFAULT 0 NOT NULL,
    processed_at timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.payroll_runs OWNER TO postgres;

--
-- Name: payroll_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payroll_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payroll_runs_id_seq OWNER TO postgres;

--
-- Name: payroll_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payroll_runs_id_seq OWNED BY public.payroll_runs.id;


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payslips (
    id integer NOT NULL,
    payroll_run_id integer NOT NULL,
    employee_id integer NOT NULL,
    run_month integer NOT NULL,
    run_year integer NOT NULL,
    basic_salary numeric(12,3) NOT NULL,
    housing_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    transport_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    mobile_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    meal_allowance numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    other_allowances numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    gross_salary numeric(12,3) NOT NULL,
    ssc_deduction numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    income_tax_deduction numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    loan_deductions numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    other_deductions numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    total_deductions numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    net_salary numeric(12,3) NOT NULL,
    bank_name character varying(200),
    iban character varying(34),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payslips OWNER TO postgres;

--
-- Name: payslips_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payslips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payslips_id_seq OWNER TO postgres;

--
-- Name: payslips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payslips_id_seq OWNED BY public.payslips.id;


--
-- Name: system_configurations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_configurations (
    id integer NOT NULL,
    company_id integer NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description character varying(500),
    category character varying(50) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id integer
);


ALTER TABLE public.system_configurations OWNER TO postgres;

--
-- Name: system_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.system_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.system_configurations_id_seq OWNER TO postgres;

--
-- Name: system_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.system_configurations_id_seq OWNED BY public.system_configurations.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    employee_id integer,
    company_id integer NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(150) NOT NULL,
    role character varying(30) DEFAULT 'employee'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    must_change_password boolean DEFAULT false,
    refresh_token character varying(500),
    refresh_token_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Name: asset_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_categories ALTER COLUMN id SET DEFAULT nextval('public.asset_categories_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: attendance_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records ALTER COLUMN id SET DEFAULT nextval('public.attendance_records_id_seq'::regclass);


--
-- Name: banks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.banks ALTER COLUMN id SET DEFAULT nextval('public.banks_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: document_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_types ALTER COLUMN id SET DEFAULT nextval('public.document_types_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: job_titles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_titles ALTER COLUMN id SET DEFAULT nextval('public.job_titles_id_seq'::regclass);


--
-- Name: leave_balances id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances ALTER COLUMN id SET DEFAULT nextval('public.leave_balances_id_seq'::regclass);


--
-- Name: leave_policies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policies ALTER COLUMN id SET DEFAULT nextval('public.leave_policies_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: leave_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types ALTER COLUMN id SET DEFAULT nextval('public.leave_types_id_seq'::regclass);


--
-- Name: nationalities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nationalities ALTER COLUMN id SET DEFAULT nextval('public.nationalities_id_seq'::regclass);


--
-- Name: overtime_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.overtime_requests ALTER COLUMN id SET DEFAULT nextval('public.overtime_requests_id_seq'::regclass);


--
-- Name: payroll_runs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs ALTER COLUMN id SET DEFAULT nextval('public.payroll_runs_id_seq'::regclass);


--
-- Name: payslips id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips ALTER COLUMN id SET DEFAULT nextval('public.payslips_id_seq'::regclass);


--
-- Name: system_configurations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_configurations ALTER COLUMN id SET DEFAULT nextval('public.system_configurations_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, type, description, employee_name, company_id, created_at) FROM stdin;
1	overtime_request	Overtime request submitted by Layla Haddad (2.5h on 2026-04-06)	Layla Haddad	1	2026-04-06 16:55:51.912743+00
2	payroll_run	Payroll run created for 4/2026 — 6 employees — by admin	\N	1	2026-04-06 17:01:54.838964+00
\.


--
-- Data for Name: asset_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.asset_categories (id, name_ar, name_en, is_active, created_at) FROM stdin;
1	أجهزة الحاسوب	Computers	t	2026-04-06 15:51:06.135571+00
2	الهواتف المحمولة	Mobile Phones	t	2026-04-06 15:51:06.135571+00
3	أثاث المكتب	Office Furniture	t	2026-04-06 15:51:06.135571+00
4	السيارات	Vehicles	t	2026-04-06 15:51:06.135571+00
5	أجهزة الطباعة	Printers	t	2026-04-06 15:51:06.135571+00
6	شاشات العرض	Monitors	t	2026-04-06 15:51:06.135571+00
7	المعدات الإلكترونية	Electronics	t	2026-04-06 15:51:06.135571+00
8	أخرى	Other	t	2026-04-06 15:51:06.135571+00
9	Computers	Computers	t	2026-04-06 16:26:13.282473+00
10	Mobile Phones	Mobile Phones	t	2026-04-06 16:26:13.282473+00
11	Office Furniture	Office Furniture	t	2026-04-06 16:26:13.282473+00
12	Vehicles	Vehicles	t	2026-04-06 16:26:13.282473+00
13	Printers	Printers	t	2026-04-06 16:26:13.282473+00
14	Monitors	Monitors	t	2026-04-06 16:26:13.282473+00
15	Electronics	Electronics	t	2026-04-06 16:26:13.282473+00
16	Other	Other	t	2026-04-06 16:26:13.282473+00
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assets (id, company_id, category_id, name_ar, name_en, serial_number, model, brand, purchase_date, purchase_value, current_status, assigned_to_employee_id, assigned_date, returned_date, notes, is_active, created_at, updated_at, is_deleted) FROM stdin;
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_records (id, employee_id, date, clock_in, clock_out, worked_minutes, status, late_minutes, overtime_minutes, notes, created_at, updated_at) FROM stdin;
1	8	2026-04-06	2026-04-06 16:38:30.794+00	2026-04-06 17:57:39.844+00	79	late	518	0	\N	2026-04-06 16:38:30.795518+00	2026-04-06 17:57:39.845+00
\.


--
-- Data for Name: banks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.banks (id, name_ar, name_en, swift_code, is_active, created_at) FROM stdin;
1	البنك الأردني	Jordan Bank	JRJBJOAMXXX	t	2026-04-06 15:50:52.530326+00
2	بنك الأردن	Bank of Jordan	BOJOJO11XXX	t	2026-04-06 15:50:52.530326+00
3	البنك العربي	Arab Bank	ARABJOAXXX	t	2026-04-06 15:50:52.530326+00
4	البنك الأهلي	Jordan Ahli Bank	NBJOJOAMXXX	t	2026-04-06 15:50:52.530326+00
5	بنك الإسكان	Housing Bank	HBJOJOAMXXX	t	2026-04-06 15:50:52.530326+00
6	الكابيتال بنك	Capital Bank	CAPBJOA1XXX	t	2026-04-06 15:50:52.530326+00
7	بنك الإتحاد	Union Bank	UNIBJOA1XXX	t	2026-04-06 15:50:52.530326+00
8	بنك المشرق	Mashreq Bank	BOMLJOA1XXX	t	2026-04-06 15:50:52.530326+00
9	بنك ستاندرد تشارترد	Standard Chartered	SCBLJOA1XXX	t	2026-04-06 15:50:52.530326+00
10	بنك HSBC	HSBC Bank	HSBCJOA1XXX	t	2026-04-06 15:50:52.530326+00
11	البنك الأردني الكويتي	Jordan Kuwait Bank	JKUBJOA1XXX	t	2026-04-06 15:50:52.530326+00
12	البنك الأردني	Jordan Bank	JRJBJOAMXXX	t	2026-04-06 15:51:06.125522+00
13	بنك الأردن	Bank of Jordan	BOJOJO11XXX	t	2026-04-06 15:51:06.125522+00
14	البنك العربي	Arab Bank	ARABJOAXXX	t	2026-04-06 15:51:06.125522+00
15	البنك الأهلي	Jordan Ahli Bank	NBJOJOAMXXX	t	2026-04-06 15:51:06.125522+00
16	بنك الإسكان	Housing Bank	HBJOJOAMXXX	t	2026-04-06 15:51:06.125522+00
17	الكابيتال بنك	Capital Bank	CAPBJOA1XXX	t	2026-04-06 15:51:06.125522+00
18	بنك الإتحاد	Union Bank	UNIBJOA1XXX	t	2026-04-06 15:51:06.125522+00
19	بنك المشرق	Mashreq Bank	BOMLJOA1XXX	t	2026-04-06 15:51:06.125522+00
20	بنك ستاندرد تشارترد	Standard Chartered	SCBLJOA1XXX	t	2026-04-06 15:51:06.125522+00
21	بنك HSBC	HSBC Bank	HSBCJOA1XXX	t	2026-04-06 15:51:06.125522+00
22	البنك الأردني الكويتي	Jordan Kuwait Bank	JKUBJOA1XXX	t	2026-04-06 15:51:06.125522+00
23	Jordan Bank	Jordan Bank	JRJBJOAMXXX	t	2026-04-06 16:26:13.270402+00
24	Bank of Jordan	Bank of Jordan	BOJOJO11XXX	t	2026-04-06 16:26:13.270402+00
25	Arab Bank	Arab Bank	ARABJOAXXX	t	2026-04-06 16:26:13.270402+00
26	Jordan Ahli Bank	Jordan Ahli Bank	NBJOJOAMXXX	t	2026-04-06 16:26:13.270402+00
27	Housing Bank	Housing Bank	HBJOJOAMXXX	t	2026-04-06 16:26:13.270402+00
28	Capital Bank	Capital Bank	CAPBJOA1XXX	t	2026-04-06 16:26:13.270402+00
29	Union Bank	Union Bank	UNIBJOA1XXX	t	2026-04-06 16:26:13.270402+00
30	Mashreq Bank	Mashreq Bank	BOMLJOA1XXX	t	2026-04-06 16:26:13.270402+00
31	Standard Chartered	Standard Chartered	SCBLJOA1XXX	t	2026-04-06 16:26:13.270402+00
32	HSBC Bank	HSBC Bank	HSBCJOA1XXX	t	2026-04-06 16:26:13.270402+00
33	Jordan Kuwait Bank	Jordan Kuwait Bank	JKUBJOA1XXX	t	2026-04-06 16:26:13.270402+00
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cities (id, name_ar, name_en, governorate, is_active, created_at) FROM stdin;
1	عمان	Amman	Amman	t	2026-04-06 15:50:52.526285+00
2	الزرقاء	Zarqa	Zarqa	t	2026-04-06 15:50:52.526285+00
3	إربد	Irbid	Irbid	t	2026-04-06 15:50:52.526285+00
4	العقبة	Aqaba	Aqaba	t	2026-04-06 15:50:52.526285+00
5	السلط	Salt	Balqa	t	2026-04-06 15:50:52.526285+00
6	المفرق	Mafraq	Mafraq	t	2026-04-06 15:50:52.526285+00
7	الكرك	Karak	Karak	t	2026-04-06 15:50:52.526285+00
8	معان	Ma'an	Ma'an	t	2026-04-06 15:50:52.526285+00
9	الطفيلة	Tafilah	Tafilah	t	2026-04-06 15:50:52.526285+00
10	مادبا	Madaba	Madaba	t	2026-04-06 15:50:52.526285+00
11	جرش	Jerash	Jerash	t	2026-04-06 15:50:52.526285+00
12	عجلون	Ajloun	Ajloun	t	2026-04-06 15:50:52.526285+00
13	عمان	Amman	Amman	t	2026-04-06 15:51:06.121458+00
14	الزرقاء	Zarqa	Zarqa	t	2026-04-06 15:51:06.121458+00
15	إربد	Irbid	Irbid	t	2026-04-06 15:51:06.121458+00
16	العقبة	Aqaba	Aqaba	t	2026-04-06 15:51:06.121458+00
17	السلط	Salt	Balqa	t	2026-04-06 15:51:06.121458+00
18	المفرق	Mafraq	Mafraq	t	2026-04-06 15:51:06.121458+00
19	الكرك	Karak	Karak	t	2026-04-06 15:51:06.121458+00
20	معان	Ma'an	Ma'an	t	2026-04-06 15:51:06.121458+00
21	الطفيلة	Tafilah	Tafilah	t	2026-04-06 15:51:06.121458+00
22	مادبا	Madaba	Madaba	t	2026-04-06 15:51:06.121458+00
23	جرش	Jerash	Jerash	t	2026-04-06 15:51:06.121458+00
24	عجلون	Ajloun	Ajloun	t	2026-04-06 15:51:06.121458+00
25	Amman	Amman	Amman	t	2026-04-06 16:26:13.265713+00
26	Zarqa	Zarqa	Zarqa	t	2026-04-06 16:26:13.265713+00
27	Irbid	Irbid	Irbid	t	2026-04-06 16:26:13.265713+00
28	Aqaba	Aqaba	Aqaba	t	2026-04-06 16:26:13.265713+00
29	Salt	Salt	Balqa	t	2026-04-06 16:26:13.265713+00
30	Mafraq	Mafraq	Mafraq	t	2026-04-06 16:26:13.265713+00
31	Karak	Karak	Karak	t	2026-04-06 16:26:13.265713+00
32	Ma'an	Ma'an	Ma'an	t	2026-04-06 16:26:13.265713+00
33	Tafilah	Tafilah	Tafilah	t	2026-04-06 16:26:13.265713+00
34	Madaba	Madaba	Madaba	t	2026-04-06 16:26:13.265713+00
35	Jerash	Jerash	Jerash	t	2026-04-06 16:26:13.265713+00
36	Ajloun	Ajloun	Ajloun	t	2026-04-06 16:26:13.265713+00
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name_ar, name_en, commercial_reg_no, tax_number, ssc_number, labor_ministry_no, address_ar, city, phone, email, website, logo, industry_type, currency, is_active, created_at, updated_at, is_deleted) FROM stdin;
1	شركة زنجو للتقنية	ZenJO Technology Company	12345	7654321	\N	\N	\N	Amman	+962 6 5555555	info@zenjo.jo	\N	\N	technology	JOD	t	2026-04-06 15:50:52.513027+00	2026-04-06 15:50:52.513027+00	f
3	شركة زنجو للتقنية	ZenJO Technology Company	12345	7654321	\N	\N	\N	Amman	+962 6 5555555	info@zenjo.jo	\N	\N	technology	JOD	t	2026-04-06 16:26:13.222242+00	2026-04-06 16:26:13.222242+00	f
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (id, company_id, name_ar, name_en, code, parent_department_id, manager_employee_id, cost_center_code, is_active, created_at, updated_at, is_deleted) FROM stdin;
1	1	الموارد البشرية	Human Resources	HR	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
2	1	تقنية المعلومات	Information Technology	IT	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
3	1	المالية	Finance	FIN	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
4	1	العمليات	Operations	OPS	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
5	1	المبيعات	Sales	SAL	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
6	1	خدمة العملاء	Customer Service	CS	\N	\N	\N	t	2026-04-06 15:51:06.138968+00	2026-04-06 15:51:06.138968+00	f
7	3	Human Resources	Human Resources	HR	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
8	3	Information Technology	Information Technology	IT	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
9	3	Finance	Finance	FIN	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
10	3	Operations	Operations	OPS	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
11	3	Sales	Sales	SAL	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
12	3	Customer Service	Customer Service	CS	\N	\N	\N	t	2026-04-06 16:26:13.286594+00	2026-04-06 16:26:13.286594+00	f
\.


--
-- Data for Name: document_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_types (id, name_ar, name_en, category, requires_expiry, alert_days_before, is_active, created_at) FROM stdin;
1	الهوية الوطنية	National ID	identity	f	30	t	2026-04-06 15:50:52.53412+00
2	جواز السفر	Passport	identity	t	90	t	2026-04-06 15:50:52.53412+00
3	تصريح العمل	Work Permit	employment	t	60	t	2026-04-06 15:50:52.53412+00
4	الإقامة	Residency Permit	employment	t	60	t	2026-04-06 15:50:52.53412+00
5	رخصة القيادة	Driving License	other	t	30	t	2026-04-06 15:50:52.53412+00
6	شهادة الجنسية	Citizenship Certificate	identity	f	30	t	2026-04-06 15:50:52.53412+00
7	الشهادة الجامعية	University Degree	education	f	30	t	2026-04-06 15:50:52.53412+00
8	شهادة التوظيف	Employment Certificate	employment	f	30	t	2026-04-06 15:50:52.53412+00
9	شهادة الخبرة	Experience Certificate	employment	f	30	t	2026-04-06 15:50:52.53412+00
10	التأمين الصحي	Health Insurance	insurance	t	30	t	2026-04-06 15:50:52.53412+00
11	الهوية الوطنية	National ID	identity	f	30	t	2026-04-06 15:51:06.129174+00
12	جواز السفر	Passport	identity	t	90	t	2026-04-06 15:51:06.129174+00
13	تصريح العمل	Work Permit	employment	t	60	t	2026-04-06 15:51:06.129174+00
14	الإقامة	Residency Permit	employment	t	60	t	2026-04-06 15:51:06.129174+00
15	رخصة القيادة	Driving License	other	t	30	t	2026-04-06 15:51:06.129174+00
16	شهادة الجنسية	Citizenship Certificate	identity	f	30	t	2026-04-06 15:51:06.129174+00
17	الشهادة الجامعية	University Degree	education	f	30	t	2026-04-06 15:51:06.129174+00
18	شهادة التوظيف	Employment Certificate	employment	f	30	t	2026-04-06 15:51:06.129174+00
19	شهادة الخبرة	Experience Certificate	employment	f	30	t	2026-04-06 15:51:06.129174+00
20	التأمين الصحي	Health Insurance	insurance	t	30	t	2026-04-06 15:51:06.129174+00
21	National ID	National ID	identity	f	30	t	2026-04-06 16:26:13.274956+00
22	Passport	Passport	identity	t	90	t	2026-04-06 16:26:13.274956+00
23	Work Permit	Work Permit	employment	t	60	t	2026-04-06 16:26:13.274956+00
24	Residency Permit	Residency Permit	employment	t	60	t	2026-04-06 16:26:13.274956+00
25	Driving License	Driving License	other	t	30	t	2026-04-06 16:26:13.274956+00
26	Citizenship Certificate	Citizenship Certificate	identity	f	30	t	2026-04-06 16:26:13.274956+00
27	University Degree	University Degree	education	f	30	t	2026-04-06 16:26:13.274956+00
28	Employment Certificate	Employment Certificate	employment	f	30	t	2026-04-06 16:26:13.274956+00
29	Experience Certificate	Experience Certificate	employment	f	30	t	2026-04-06 16:26:13.274956+00
30	Health Insurance	Health Insurance	insurance	t	30	t	2026-04-06 16:26:13.274956+00
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.documents (id, employee_id, document_type_id, document_number, issued_at, expires_at, file_url, notes, created_at, updated_at, is_deleted) FROM stdin;
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, company_id, employee_code, first_name_ar, middle_name_ar, last_name_ar, first_name_en, middle_name_en, last_name_en, gender, date_of_birth, national_id, nationality, religion, marital_status, number_of_dependents, personal_email, work_email, personal_phone, work_phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, address_ar, city, department_id, job_title_id, direct_manager_id, employment_type, hire_date, probation_end_date, contract_type, contract_end_date, employment_status, termination_date, termination_reason, basic_salary, housing_allowance, transport_allowance, mobile_allowance, meal_allowance, other_allowances, ssc_number, ssc_enrollment_date, is_ssc_exempt, income_tax_number, tax_exemption_amount, bank_name, bank_account_number, iban, passport_number, passport_expiry, work_permit_number, work_permit_expiry, residency_number, residency_expiry, profile_photo, notes, created_at, updated_at, is_deleted) FROM stdin;
1	1	EMP-0001	أحمد	\N	العلي	Ahmed	\N	Al-Ali	male	1985-03-15	9801234567	أردني	\N	\N	0	\N	ahmed.alali@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	1	1	\N	fulltime	2020-01-01	\N	permanent	\N	active	\N	\N	1500.000	300.000	100.000	0.000	0.000	0.000	\N	\N	f	\N	0.000	Arab Bank	\N	JO94ARAB0210000000000123456789	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 15:51:06.153863+00	2026-04-06 15:51:06.153863+00	f
3	1	EMP-0003	محمد	\N	الخطيب	Mohammad	\N	Al-Khatib	male	1988-11-05	8812345678	أردني	\N	\N	0	\N	mohammad.khatib@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	3	3	\N	fulltime	2019-06-01	\N	permanent	\N	active	\N	\N	1800.000	400.000	150.000	0.000	100.000	0.000	\N	\N	f	\N	0.000	Jordan Bank	\N	JO71JRJB3200000000001234567890	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 15:51:06.153863+00	2026-04-06 15:51:06.153863+00	f
7	1	EMP-0004	Khaled	\N	Al-Nemer	Khaled	\N	Al-Nemer	male	1983-05-20	8312345678	أردني	\N	\N	0	\N	khaled@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	8	13	\N	fulltime	2017-09-01	\N	permanent	\N	active	\N	\N	2500.000	450.000	180.000	0.000	0.000	0.000	\N	\N	f	\N	0.000	Capital Bank	\N	JO94CAPB0210000000000234567890	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 16:26:13.307689+00	2026-04-06 16:26:13.307689+00	f
9	1	EMP-0006	Yousef	\N	Al-Rashid	Yousef	\N	Al-Rashid	male	1988-08-15	8812348678	أردني	\N	\N	0	\N	yousef@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	10	\N	\N	fulltime	2020-05-01	\N	permanent	\N	active	\N	\N	1400.000	250.000	100.000	0.000	0.000	0.000	\N	\N	f	\N	0.000	Housing Bank	\N	JO66HBJO3800000000001234578890	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 16:26:13.307689+00	2026-04-06 16:26:13.307689+00	f
2	1	EMP-0002	سارة	\N	محمود	Sara	\N	Mahmoud	female	1990-07-22	9012345678	أردني	\N	\N	0	\N	sara.mahmoud@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	2	2	7	fulltime	2021-03-15	\N	permanent	\N	active	\N	\N	1200.000	200.000	75.000	0.000	0.000	0.000	\N	\N	f	\N	0.000	Housing Bank	\N	JO66HBJO3800000000001234567890	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 15:51:06.153863+00	2026-04-06 15:51:06.153863+00	f
8	1	EMP-0005	Layla	\N	Haddad	Layla	\N	Haddad	female	1992-03-10	9212345678	أردني	\N	\N	0	\N	layla@zenjo.jo	\N	\N	\N	\N	\N	\N	\N	7	10	7	fulltime	2022-01-10	\N	permanent	\N	active	\N	\N	900.000	150.000	50.000	0.000	0.000	0.000	\N	\N	f	\N	0.000	Arab Bank	\N	JO94ARAB0210000000000345678901	\N	\N	\N	\N	\N	\N	\N	\N	2026-04-06 16:26:13.307689+00	2026-04-06 16:26:13.307689+00	f
\.


--
-- Data for Name: job_titles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.job_titles (id, company_id, title_ar, title_en, job_grade, min_salary, max_salary, is_active, created_at, updated_at, is_deleted) FROM stdin;
1	1	مدير الموارد البشرية	HR Manager	G5	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
2	1	أخصائي موارد بشرية	HR Specialist	G3	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
3	1	مطور برمجيات	Software Developer	G4	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
4	1	مهندس أول	Senior Engineer	G5	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
5	1	مدير مشروع	Project Manager	G6	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
6	1	محاسب	Accountant	G3	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
7	1	مدير مالي	Finance Manager	G6	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
8	1	مدير عام	General Manager	G9	\N	\N	t	2026-04-06 15:51:06.144457+00	2026-04-06 15:51:06.144457+00	f
9	3	HR Manager	HR Manager	G5	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
10	3	HR Specialist	HR Specialist	G3	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
11	3	Software Developer	Software Developer	G4	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
12	3	Senior Engineer	Senior Engineer	G5	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
13	3	Project Manager	Project Manager	G6	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
14	3	Accountant	Accountant	G3	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
15	3	Finance Manager	Finance Manager	G6	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
16	3	General Manager	General Manager	G9	\N	\N	t	2026-04-06 16:26:13.292408+00	2026-04-06 16:26:13.292408+00	f
\.


--
-- Data for Name: leave_balances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_balances (id, employee_id, leave_policy_id, year, entitled_days, used_days, pending_days, carried_forward_days, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: leave_policies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_policies (id, company_id, leave_type, name_ar, name_en, days_per_year, max_carry_forward_days, min_service_months, requires_medical_certificate, is_paid, can_be_negative, gender, is_active, notes, created_at, updated_at, is_deleted) FROM stdin;
1	1	annual	الإجازة السنوية	Annual Leave	14.00	14.00	0	f	t	f	all	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
2	1	sick	الإجازة المرضية	Sick Leave	14.00	0.00	0	t	t	f	all	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
3	1	maternity	إجازة الأمومة	Maternity Leave	70.00	0.00	0	f	t	f	female	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
4	1	paternity	إجازة الأبوة	Paternity Leave	3.00	0.00	0	f	t	f	male	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
5	1	hajj	إجازة الحج	Hajj Leave	14.00	0.00	24	f	t	f	all	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
6	1	emergency	الإجازة الطارئة	Emergency Leave	3.00	0.00	0	f	t	f	all	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
7	1	unpaid	إجازة بدون راتب	Unpaid Leave	30.00	0.00	12	f	f	f	all	t	\N	2026-04-06 15:51:06.149419+00	2026-04-06 15:51:06.149419+00	f
8	3	annual	Annual Leave	Annual Leave	14.00	14.00	0	f	t	f	all	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
9	3	sick	Sick Leave	Sick Leave	14.00	0.00	0	t	t	f	all	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
10	3	maternity	Maternity Leave	Maternity Leave	70.00	0.00	0	f	t	f	female	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
11	3	paternity	Paternity Leave	Paternity Leave	3.00	0.00	0	f	t	f	male	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
12	3	hajj	Hajj Leave	Hajj Leave	14.00	0.00	24	f	t	f	all	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
13	3	emergency	Emergency Leave	Emergency Leave	3.00	0.00	0	f	t	f	all	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
14	3	unpaid	Unpaid Leave	Unpaid Leave	30.00	0.00	12	f	f	f	all	t	\N	2026-04-06 16:26:13.300428+00	2026-04-06 16:26:13.300428+00	f
\.


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_requests (id, employee_id, leave_type, start_date, end_date, total_days, reason, status, approved_by_id, approved_at, rejection_reason, created_at, updated_at, is_deleted) FROM stdin;
\.


--
-- Data for Name: leave_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_types (id, name_ar, name_en, code, color, is_active, created_at) FROM stdin;
1	إجازة سنوية	Annual Leave	annual	green	t	2026-04-06 15:51:06.132431+00
2	إجازة مرضية	Sick Leave	sick	red	t	2026-04-06 15:51:06.132431+00
3	إجازة طارئة	Emergency Leave	emergency	orange	t	2026-04-06 15:51:06.132431+00
4	إجازة أمومة	Maternity Leave	maternity	pink	t	2026-04-06 15:51:06.132431+00
5	إجازة أبوة	Paternity Leave	paternity	blue	t	2026-04-06 15:51:06.132431+00
6	إجازة حج	Hajj Leave	hajj	purple	t	2026-04-06 15:51:06.132431+00
7	إجازة بدون راتب	Unpaid Leave	unpaid	gray	t	2026-04-06 15:51:06.132431+00
8	إجازة وفاة	Bereavement Leave	bereavement	black	t	2026-04-06 15:51:06.132431+00
9	Annual Leave	Annual Leave	annual	green	t	2026-04-06 16:26:13.279169+00
10	Sick Leave	Sick Leave	sick	red	t	2026-04-06 16:26:13.279169+00
11	Emergency Leave	Emergency Leave	emergency	orange	t	2026-04-06 16:26:13.279169+00
12	Maternity Leave	Maternity Leave	maternity	pink	t	2026-04-06 16:26:13.279169+00
13	Paternity Leave	Paternity Leave	paternity	blue	t	2026-04-06 16:26:13.279169+00
14	Hajj Leave	Hajj Leave	hajj	purple	t	2026-04-06 16:26:13.279169+00
15	Unpaid Leave	Unpaid Leave	unpaid	gray	t	2026-04-06 16:26:13.279169+00
16	Bereavement Leave	Bereavement Leave	bereavement	black	t	2026-04-06 16:26:13.279169+00
\.


--
-- Data for Name: nationalities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nationalities (id, name_ar, name_en, country_code, is_active, created_at) FROM stdin;
1	أردني	Jordanian	JO	t	2026-04-06 15:50:52.521793+00
2	سوري	Syrian	SY	t	2026-04-06 15:50:52.521793+00
3	مصري	Egyptian	EG	t	2026-04-06 15:50:52.521793+00
4	فلسطيني	Palestinian	PS	t	2026-04-06 15:50:52.521793+00
5	لبناني	Lebanese	LB	t	2026-04-06 15:50:52.521793+00
6	عراقي	Iraqi	IQ	t	2026-04-06 15:50:52.521793+00
7	سعودي	Saudi	SA	t	2026-04-06 15:50:52.521793+00
8	إماراتي	Emirati	AE	t	2026-04-06 15:50:52.521793+00
9	بريطاني	British	GB	t	2026-04-06 15:50:52.521793+00
10	أمريكي	American	US	t	2026-04-06 15:50:52.521793+00
11	هندي	Indian	IN	t	2026-04-06 15:50:52.521793+00
12	باكستاني	Pakistani	PK	t	2026-04-06 15:50:52.521793+00
13	فلبيني	Filipino	PH	t	2026-04-06 15:50:52.521793+00
14	بنغلاديشي	Bangladeshi	BD	t	2026-04-06 15:50:52.521793+00
15	سريلانكي	Sri Lankan	LK	t	2026-04-06 15:50:52.521793+00
16	أردني	Jordanian	JO	t	2026-04-06 15:51:06.117034+00
17	سوري	Syrian	SY	t	2026-04-06 15:51:06.117034+00
18	مصري	Egyptian	EG	t	2026-04-06 15:51:06.117034+00
19	فلسطيني	Palestinian	PS	t	2026-04-06 15:51:06.117034+00
20	لبناني	Lebanese	LB	t	2026-04-06 15:51:06.117034+00
21	عراقي	Iraqi	IQ	t	2026-04-06 15:51:06.117034+00
22	سعودي	Saudi	SA	t	2026-04-06 15:51:06.117034+00
23	إماراتي	Emirati	AE	t	2026-04-06 15:51:06.117034+00
24	بريطاني	British	GB	t	2026-04-06 15:51:06.117034+00
25	أمريكي	American	US	t	2026-04-06 15:51:06.117034+00
26	هندي	Indian	IN	t	2026-04-06 15:51:06.117034+00
27	باكستاني	Pakistani	PK	t	2026-04-06 15:51:06.117034+00
28	فلبيني	Filipino	PH	t	2026-04-06 15:51:06.117034+00
29	بنغلاديشي	Bangladeshi	BD	t	2026-04-06 15:51:06.117034+00
30	سريلانكي	Sri Lankan	LK	t	2026-04-06 15:51:06.117034+00
31	Jordanian	Jordanian	JO	t	2026-04-06 16:26:13.260337+00
32	Syrian	Syrian	SY	t	2026-04-06 16:26:13.260337+00
33	Egyptian	Egyptian	EG	t	2026-04-06 16:26:13.260337+00
34	Palestinian	Palestinian	PS	t	2026-04-06 16:26:13.260337+00
35	Lebanese	Lebanese	LB	t	2026-04-06 16:26:13.260337+00
36	Iraqi	Iraqi	IQ	t	2026-04-06 16:26:13.260337+00
37	Saudi	Saudi	SA	t	2026-04-06 16:26:13.260337+00
38	Emirati	Emirati	AE	t	2026-04-06 16:26:13.260337+00
39	British	British	GB	t	2026-04-06 16:26:13.260337+00
40	American	American	US	t	2026-04-06 16:26:13.260337+00
41	Indian	Indian	IN	t	2026-04-06 16:26:13.260337+00
42	Pakistani	Pakistani	PK	t	2026-04-06 16:26:13.260337+00
43	Filipino	Filipino	PH	t	2026-04-06 16:26:13.260337+00
44	Bangladeshi	Bangladeshi	BD	t	2026-04-06 16:26:13.260337+00
45	Sri Lankan	Sri Lankan	LK	t	2026-04-06 16:26:13.260337+00
\.


--
-- Data for Name: overtime_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.overtime_requests (id, employee_id, date, hours, reason, status, manager_approved_by_id, manager_approved_at, hr_approved_by_id, hr_approved_at, rejection_reason, linked_payslip_id, created_at, updated_at, is_deleted) FROM stdin;
1	8	2026-04-06	2.50	Urgent project deadline	pending	\N	\N	\N	\N	\N	\N	2026-04-06 16:55:51.905175+00	2026-04-06 16:55:51.905175+00	f
\.


--
-- Data for Name: payroll_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_runs (id, company_id, run_month, run_year, status, total_gross, total_net, total_deductions, employee_count, processed_at, approved_at, approved_by_id, notes, created_at, updated_at, is_deleted) FROM stdin;
1	1	4	2026	draft	11805.000	10237.500	1567.500	6	2026-04-06 17:01:54.821+00	\N	\N	\N	2026-04-06 17:01:54.8223+00	2026-04-06 17:01:54.835+00	f
\.


--
-- Data for Name: payslips; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payslips (id, payroll_run_id, employee_id, run_month, run_year, basic_salary, housing_allowance, transport_allowance, mobile_allowance, meal_allowance, other_allowances, gross_salary, ssc_deduction, income_tax_deduction, loan_deductions, other_deductions, total_deductions, net_salary, bank_name, iban, created_at) FROM stdin;
1	1	1	4	2026	1500.000	300.000	100.000	0.000	0.000	0.000	1900.000	112.500	110.000	0.000	0.000	222.500	1677.500	Arab Bank	JO94ARAB0210000000000123456789	2026-04-06 17:01:54.831367+00
2	1	3	4	2026	1800.000	400.000	150.000	0.000	100.000	0.000	2450.000	135.000	216.667	0.000	0.000	351.667	2098.333	Jordan Bank	JO71JRJB3200000000001234567890	2026-04-06 17:01:54.831367+00
3	1	7	4	2026	2500.000	450.000	180.000	0.000	0.000	0.000	3130.000	187.500	386.667	0.000	0.000	574.167	2555.833	Capital Bank	JO94CAPB0210000000000234567890	2026-04-06 17:01:54.831367+00
4	1	9	4	2026	1400.000	250.000	100.000	0.000	0.000	0.000	1750.000	105.000	87.500	0.000	0.000	192.500	1557.500	Housing Bank	JO66HBJO3800000000001234578890	2026-04-06 17:01:54.831367+00
5	1	2	4	2026	1200.000	200.000	75.000	0.000	0.000	0.000	1475.000	90.000	51.667	0.000	0.000	141.667	1333.333	Housing Bank	JO66HBJO3800000000001234567890	2026-04-06 17:01:54.831367+00
6	1	8	4	2026	900.000	150.000	50.000	0.000	0.000	0.000	1100.000	67.500	17.500	0.000	0.000	85.000	1015.000	Arab Bank	JO94ARAB0210000000000345678901	2026-04-06 17:01:54.831367+00
\.


--
-- Data for Name: system_configurations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_configurations (id, company_id, key, value, description, category, updated_at, updated_by_user_id) FROM stdin;
1	1	work_start_time	08:00	Default work start time (HH:MM)	attendance	2026-04-06 16:49:24.759489+00	\N
2	1	work_end_time	17:00	Default work end time (HH:MM)	attendance	2026-04-06 16:49:24.759489+00	\N
4	1	standard_work_hours	8	Standard daily work hours	attendance	2026-04-06 16:49:24.759489+00	\N
5	1	overtime_rate	1.5	Overtime pay multiplier	payroll	2026-04-06 16:49:24.759489+00	\N
6	1	ssc_employee_rate	7.5	Social Security employee contribution rate (%)	payroll	2026-04-06 16:49:24.759489+00	\N
7	1	ssc_employer_rate	14.25	Social Security employer contribution rate (%)	payroll	2026-04-06 16:49:24.759489+00	\N
8	1	income_tax_exemption	3000	Annual income tax exemption threshold (JOD)	payroll	2026-04-06 16:49:24.759489+00	\N
9	1	probation_period_days	90	Default probation period (days)	hr	2026-04-06 16:49:24.759489+00	\N
10	1	payroll_day	25	Day of month payroll is processed	payroll	2026-04-06 16:49:24.759489+00	\N
11	1	leave_accrual_type	monthly	How leave days are accrued: monthly or annually	leave	2026-04-06 16:49:24.759489+00	\N
12	1	annual_leave_days	14	Annual leave days per year (Jordanian labor law minimum)	leave	2026-04-06 16:49:24.759489+00	\N
13	1	eosb_rate_per_year	1	End of Service Benefit: months salary per year of service	hr	2026-04-06 16:49:24.759489+00	\N
14	1	working_days_per_week	5	Number of working days per week	attendance	2026-04-06 16:49:24.759489+00	\N
15	1	currency	JOD	Company currency code	general	2026-04-06 16:49:24.759489+00	\N
16	1	company_name_ar	شركة ZenJO	Company name in Arabic	general	2026-04-06 16:49:24.759489+00	\N
17	1	company_name_en	ZenJO Company	Company name in English	general	2026-04-06 16:49:24.759489+00	\N
3	1	late_threshold_minutes	20	Grace period before marking employee as late (minutes)	attendance	2026-04-06 16:55:52.028+00	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, employee_id, company_id, username, password_hash, email, role, is_active, last_login_at, must_change_password, refresh_token, refresh_token_expiry, created_at, updated_at, is_deleted) FROM stdin;
5	3	1	payroll	1dd5bb8f5206282b1122351f2cb1c39f29cb6d5f0452970e5ba0330c8688f92b	payroll@zenjo.jo	payrolladmin	t	2026-04-06 17:56:28.385+00	f	\N	\N	2026-04-06 16:26:13.327105+00	2026-04-06 17:56:47.007+00	f
6	7	1	manager	1e72d481691d4f949457ee19d0805acca7a321bba6db3298fb96f61ed53c42d7	manager@zenjo.jo	manager	t	2026-04-06 17:56:53.438+00	f	\N	\N	2026-04-06 16:26:13.330073+00	2026-04-06 17:57:25.538+00	f
7	8	1	employee	c7976f3287dfe06048a96958e251b6fc79dea2cf20437d3d5cd7d6a4302c6808	employee@zenjo.jo	employee	t	2026-04-06 17:57:32.602+00	f	\N	\N	2026-04-06 16:26:13.333647+00	2026-04-06 17:58:12.072+00	f
8	9	1	recruiter	933791ebf5411d948a6baaf5a05c019e1247bfa2bf2db883467cb8e346bdb33f	recruiter@zenjo.jo	recruiter	t	2026-04-06 18:25:14.172+00	f	\N	\N	2026-04-06 16:26:13.337351+00	2026-04-06 19:28:02.628+00	f
2	2	1	hr	effbceb3b192a3bafeeb24ea0637451fa10004642bdaebd14a795c65cc877c24	hr@zenjo.jo	hradmin	t	2026-04-06 19:29:07.369+00	f	509ddb55a18f616f28c4da4f15e2846272be6b0d6952d3631b07331a1421fe40	\N	2026-04-06 15:51:06.162326+00	2026-04-06 19:29:07.369+00	f
1	1	1	admin	3b929697316ce55c9e254c2784e5587dcc3f28c0a66ce01914596522c98f1cce	admin@zenjo.jo	superadmin	t	2026-04-06 19:30:23.922+00	f	ca745b03eebb02eff8ad9ca7039bbb9aaa88ee86ecb51c608d23ed87eb753291	\N	2026-04-06 15:51:06.159473+00	2026-04-06 19:30:23.922+00	f
\.


--
-- Name: activity_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.activity_logs_id_seq', 2, true);


--
-- Name: asset_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.asset_categories_id_seq', 16, true);


--
-- Name: assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.assets_id_seq', 1, false);


--
-- Name: attendance_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_records_id_seq', 1, true);


--
-- Name: banks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.banks_id_seq', 33, true);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cities_id_seq', 36, true);


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.companies_id_seq', 3, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.departments_id_seq', 12, true);


--
-- Name: document_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.document_types_id_seq', 30, true);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.documents_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employees_id_seq', 9, true);


--
-- Name: job_titles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.job_titles_id_seq', 16, true);


--
-- Name: leave_balances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leave_balances_id_seq', 1, false);


--
-- Name: leave_policies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leave_policies_id_seq', 14, true);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leave_requests_id_seq', 1, false);


--
-- Name: leave_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leave_types_id_seq', 16, true);


--
-- Name: nationalities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.nationalities_id_seq', 45, true);


--
-- Name: overtime_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.overtime_requests_id_seq', 1, true);


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payroll_runs_id_seq', 1, true);


--
-- Name: payslips_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payslips_id_seq', 6, true);


--
-- Name: system_configurations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.system_configurations_id_seq', 17, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 8, true);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: banks banks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: employees employees_employee_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_unique UNIQUE (employee_code);


--
-- Name: employees employees_national_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_national_id_unique UNIQUE (national_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_work_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_work_email_unique UNIQUE (work_email);


--
-- Name: job_titles job_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: leave_policies leave_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policies
    ADD CONSTRAINT leave_policies_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: leave_types leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);


--
-- Name: nationalities nationalities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nationalities
    ADD CONSTRAINT nationalities_pkey PRIMARY KEY (id);


--
-- Name: overtime_requests overtime_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT overtime_requests_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: system_configurations system_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_configurations
    ADD CONSTRAINT system_configurations_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: assets assets_assigned_to_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_assigned_to_employee_id_employees_id_fk FOREIGN KEY (assigned_to_employee_id) REFERENCES public.employees(id);


--
-- Name: assets assets_category_id_asset_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_category_id_asset_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.asset_categories(id);


--
-- Name: assets assets_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: attendance_records attendance_records_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: departments departments_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: documents documents_document_type_id_document_types_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_document_type_id_document_types_id_fk FOREIGN KEY (document_type_id) REFERENCES public.document_types(id);


--
-- Name: documents documents_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: employees employees_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: employees employees_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: employees employees_job_title_id_job_titles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_job_title_id_job_titles_id_fk FOREIGN KEY (job_title_id) REFERENCES public.job_titles(id);


--
-- Name: job_titles job_titles_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: leave_balances leave_balances_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: leave_balances leave_balances_leave_policy_id_leave_policies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_leave_policy_id_leave_policies_id_fk FOREIGN KEY (leave_policy_id) REFERENCES public.leave_policies(id);


--
-- Name: leave_policies leave_policies_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policies
    ADD CONSTRAINT leave_policies_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: leave_requests leave_requests_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: overtime_requests overtime_requests_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT overtime_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: payroll_runs payroll_runs_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: payslips payslips_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: payslips payslips_payroll_run_id_payroll_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_payroll_run_id_payroll_runs_id_fk FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id);


--
-- Name: users users_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: users users_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 9951jQwx6dzCwEfpCstUti8xw9bwEyamSetxToOhILhZEM2jMZxzfcgnlLm4NKE

