# Cleanup Sprint 6 - Documents + Compliance + Recruitment Handoff Canonicalization

Generated: 2026-05-14

## Status

**Sprint 6 status: GO**

Enterprise documents are now the operational document truth for the validated recruitment, contract, compliance, and attachment handoff paths. Legacy tables remain in place, but new business visibility is reconciled through `enterprise_documents`.

No migration was created for this sprint. The cleanup uses additive-safe service logic and existing Bundle C / Phase B tables.

## Files Changed

- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/compliance-contracts.service.ts`
- `qa/cleanup-sprint-6-smoke.cjs`
- `qa/cleanup-sprint-6-browser.cjs`
- `qa/cleanup-sprint-6-results.json`
- `qa/cleanup-sprint-6-documents-results.json`
- `qa/cleanup-sprint-6-compliance-results.json`
- `qa/cleanup-sprint-6-recruitment-results.json`
- `qa/cleanup-sprint-6-rbac-results.json`
- `qa/cleanup-sprint-6-tenant-results.json`
- `qa/cleanup-sprint-6-browser-results.json`
- `qa/cleanup-sprint-6-report.md`

## Implementation Summary

### Canonical Enterprise Document Linkage

Added safe helper logic to create or reuse enterprise document categories and canonical `enterprise_documents` records for:

- recruitment candidate documents
- recruitment conversion contract drafts
- converted candidate required document placeholders
- converted candidate onboarding document references
- contract attachments
- contract-required document rows

The helper deduplicates by `company_id`, `source_module`, `entity_type`, and `entity_id`, so repeated handoff operations do not silently create duplicate document records.

### Recruitment Handoff

Candidate conversion now returns a deterministic handoff payload with:

- `employeeId`
- `userId`
- `contractId`
- `requiredDocumentIds`
- `enterpriseDocumentIds`

Retrying conversion for an already converted candidate now returns the existing employee/contract/document linkage with `alreadyConverted: true` instead of creating duplicates.

### Contract + Compliance Canonicalization

Contract creation now creates a draft enterprise document for the contract record.

Contract attachment creation now creates an enterprise document with:

- source module: `compliance`
- entity type: `contract_attachment`
- entity id: `contract_attachments.id`
- metadata including required lifecycle state and contract linkage

Required document creation now creates an enterprise document with:

- source module: `compliance`
- entity type: `contract_required_document`
- entity id: `contract_required_documents.id`
- metadata including `requiredState: pending_upload`

Contract detail now returns enterprise document linkage for attachments and required documents.

### Document RBAC and Tenant Hardening

Enterprise document creation now validates that referenced employees, candidates, categories, and file objects belong to the caller company.

Manager document list scope was tightened to team employees only. It no longer includes unowned company-level documents by default.

Validated access rules:

- recruiter can export recruitment data
- recruiter cannot create payroll documents
- recruiter cannot export payroll
- payroll admin cannot create HR documents
- employee document list remains scoped to own employee id
- invalid/cross-company employee references fail safely

## Validation Evidence

### Build and Runtime

- `pnpm.cmd run typecheck`: passed
- Angular development build: passed
- Angular production build: passed
- `/api/healthz`: `200`, healthy

Known non-blocking warning: existing Angular style budget warning for `layout.component.scss`.

### API Smoke

Output: `qa/cleanup-sprint-6-results.json`

Status: **GO**

#### Recruitment Conversion Evidence

| Check | Result |
| --- | ---: |
| Candidate create | `201` |
| Candidate id | `22` |
| Candidate document create | `201` |
| Candidate enterprise document id | `16` |
| Convert candidate | `201` |
| Employee id | `48` |
| Contract id | `25` |
| Required document ids | `36, 37, 38` |
| Enterprise document ids | `17, 18, 19, 20, 16` |
| Retry conversion status | `200` |
| Retry marked already converted | `true` |
| Duplicate conversion prevented | `true` |

#### Compliance Evidence

| Check | Result |
| --- | ---: |
| Contract detail | `200` |
| Contract-specific required docs checked | `3` |
| Required docs have enterprise docs | `true` |
| Contract enterprise document found | `true` |
| Contract attachment create | `201` |
| Attachment enterprise document id | `21` |
| Attachment linked in contract detail | `true` |

The contract detail includes older type/template required documents as compatibility rows. The Sprint 6 canonical lifecycle assertion is intentionally checked against the newly created contract-specific required documents.

#### Document Visibility Evidence

| Check | Result |
| --- | ---: |
| Attachment appears in document center | `true` |
| Candidate document has enterprise document | `true` |
| Employee document list | `200` |
| Manager document list | `200` |
| Employee sees only own documents | `true` |
| Manager sees scoped employee documents only | `true` |

#### RBAC Evidence

| Check | Result |
| --- | ---: |
| Recruiter creates payroll document | `403` |
| Payroll admin creates HR document | `403` |
| Recruiter recruitment export | `200` |
| Recruiter payroll export | `403` |

Result: **GO**

#### Tenant Evidence

| Check | Result |
| --- | ---: |
| HR creates document for invalid/cross-company employee id | `400` |

Result: **GO**

### Browser UAT

Output: `qa/cleanup-sprint-6-browser-results.json`

Status: **GO**

Validated with Chrome/CDP against the production Angular build:

- `/app/documents-reporting` loads
- `/app/compliance-contracts` loads
- `/app/recruitment` loads
- dark-mode readability sample passed
- mobile documents route has no horizontal overflow
- no critical console errors

### Regression Checks

Re-ran:

- Cleanup Sprint 2 smoke: GO
- Cleanup Sprint 3 smoke: GO
- Cleanup Sprint 5 smoke: GO

No regression was observed in unified approvals/notifications, leave canonicalization, or payroll truth validation.

## Remaining Limitations

- Existing historical contract type/template required document rows do not all have enterprise document records. Sprint 6 canonicalizes newly created contract-specific required documents and contract attachments.
- Existing historical mojibake in old seed/display data remains visible in some browser text extraction. This sprint fixed targeted operational linkage and did not perform a global data cleanup.
- Generated PDF/export registration was validated at the authorization/document-center level, but this sprint did not add a new PDF worker or a new document generation module.

## Final Determination

Cleanup Sprint 6 is **GO**.

Success criteria satisfied:

- `enterprise_documents` is now the canonical document record for validated recruitment, contract, attachment, and compliance handoff paths.
- Recruitment conversion creates employee, user, onboarding, draft contract, required document rows, and enterprise document placeholders.
- Retry conversion is deterministic and does not duplicate employee/user/contract/document handoff.
- Contract attachments reconcile with enterprise documents.
- Contract-specific required documents reconcile with enterprise documents.
- Employee/manager/recruiter/payroll document RBAC passed.
- Tenant reference validation passed.
- Browser/CDP UAT passed.
- Typecheck and Angular builds passed.
