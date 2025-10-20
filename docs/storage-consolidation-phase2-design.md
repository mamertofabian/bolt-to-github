# Phase 2: Design - Storage Format Consolidation

**Duration**: 1 week
**Approach**: TDD-focused design with safety-first architecture
**Goal**: Design unified storage format and migration strategy with comprehensive safety mechanisms

---

## Objectives

1. Design unified storage format that replaces both `projectSettings` and `boltProjects`
2. Specify migration algorithm with atomic transaction guarantees
3. Design all safety mechanisms (backup, rollback, validation)
4. Create data integrity verification strategy
5. Plan backward compatibility approach

---

## Actionable Items

### 1. Unified Storage Format Design

#### 1.1 Define Schema

- [ ] Identify all fields from `ProjectSetting` interface needed for extension functionality
- [ ] Identify all fields from `BoltProject` interface needed for backend sync
- [ ] Merge into single comprehensive schema with no field name conflicts
- [ ] Decide on storage location: `chrome.storage.local` vs `chrome.storage.sync` vs both
- [ ] Define field naming convention (prefer backend schema names for consistency)
- [ ] Add version field for future migrations
- [ ] Document which fields are required vs optional
- [ ] Specify default values for all optional fields

#### 1.2 Storage Location Strategy

- [ ] Decide primary storage area based on quota limits and sync needs
- [ ] Plan cross-device sync strategy if using `chrome.storage.local`
- [ ] Calculate storage quota requirements for 1/10/50/100 projects
- [ ] Verify quota limits won't be exceeded for power users
- [ ] Design fallback strategy if quota exceeded

#### 1.3 Data Validation Rules

- [ ] Define validation rules for project ID format (alphanumeric, hyphens, underscores)
- [ ] Specify validation for required fields (repoName, branch, etc.)
- [ ] Define handling for invalid data during migration
- [ ] Specify error messages for validation failures

### 2. Migration Algorithm Design

#### 2.1 Pre-Migration Phase

- [ ] Design backup creation mechanism (format, location, metadata)
- [ ] Specify backup verification process
- [ ] Design storage space check before migration
- [ ] Define migration eligibility criteria (already migrated, storage version)
- [ ] Specify user notification strategy and timing

#### 2.2 Migration Execution Phase

- [ ] Design atomic transaction approach (all-or-nothing guarantee)
- [ ] Specify data merging strategy for projects in both formats
- [ ] Define deduplication logic (same project ID in both formats)
- [ ] Design handling for github.com temporary projects (filter or migrate)
- [ ] Specify metadata preservation strategy (GitHub cache data, timestamps)
- [ ] Define project ownership resolution (repoOwner global vs per-project)
- [ ] Design validation checkpoints within migration

#### 2.3 Post-Migration Phase

- [ ] Design data integrity verification process
- [ ] Specify success criteria for migration completion
- [ ] Define migration metadata to store (timestamp, project counts, errors)
- [ ] Design health check for post-migration state
- [ ] Specify cleanup process for old format data (keep as backup or remove)

### 3. Safety Mechanisms Design

#### 3.1 Automatic Backup System

- [ ] Define backup data structure and format
- [ ] Specify backup storage location and keys
- [ ] Design backup expiration policy (keep for 30 days)
- [ ] Specify backup size limits and handling
- [ ] Design backup verification checksums or hashes

#### 3.2 Migration Version Control

- [ ] Define version flag structure and location (`storageFormatVersion`)
- [ ] Specify version values (1=old, 2=new, etc.)
- [ ] Design multi-device coordination strategy
- [ ] Define version conflict resolution (different devices at different versions)
- [ ] Specify version upgrade path for future migrations

#### 3.3 Rollback Mechanism

- [ ] Design rollback trigger conditions (what constitutes migration failure)
- [ ] Specify rollback procedure step-by-step
- [ ] Define rollback verification process
- [ ] Design user notification for rollback events
- [ ] Specify logging for rollback debugging

#### 3.4 Validation and Integrity Checks

- [ ] Design pre-migration data validation
- [ ] Specify post-migration data integrity verification
- [ ] Define comparison logic (old vs new format data match)
- [ ] Design handling for validation failures (rollback vs manual intervention)
- [ ] Specify logging for all validation steps

### 4. Feature Flag and Staged Rollout Design

#### 4.1 Feature Flag Implementation

- [ ] Define feature flag storage location and key
- [ ] Specify flag values (disabled, canary, percentage-based)
- [ ] Design remote config integration (if applicable) vs local-only
- [ ] Define user selection criteria for staged rollout (random, user ID hash)
- [ ] Design kill switch mechanism for emergency disable

#### 4.2 Rollout Stages

- [ ] Define Stage 1 criteria (5% canary, ~100 users)
- [ ] Define Stage 2 criteria (25% expanded, ~500 users)
- [ ] Define Stage 3 criteria (50% majority, ~1000 users)
- [ ] Define Stage 4 criteria (100% full rollout, ~2000 users)
- [ ] Specify go/no-go criteria between stages
- [ ] Define monitoring metrics for each stage

#### 4.3 Monitoring and Telemetry

- [ ] Design migration success/failure event logging
- [ ] Specify error tracking and categorization
- [ ] Define performance metrics (migration duration)
- [ ] Design user-facing progress indicators
- [ ] Specify support request tracking

### 5. Edge Cases and Error Handling

#### 5.1 Data Edge Cases

- [ ] Design handling for empty storage (new install)
- [ ] Specify handling for single project vs 50+ projects
- [ ] Define strategy for duplicate project IDs with conflicting data
- [ ] Design handling for orphaned projects (in one format but not other)
- [ ] Specify handling for invalid project IDs (github.com, special characters)
- [ ] Define strategy for missing required fields

#### 5.2 Migration Failure Scenarios

- [ ] Design handling for storage quota exceeded mid-migration
- [ ] Specify handling for browser crash during migration
- [ ] Define recovery strategy for interrupted migration
- [ ] Design handling for corrupted source data
- [ ] Specify handling for backup creation failure

#### 5.3 Cross-Device Sync Edge Cases

- [ ] Design handling for different extension versions across devices
- [ ] Specify conflict resolution for simultaneous edits during migration
- [ ] Define strategy for one device migrated, another not yet
- [ ] Design handling for sync timing issues

### 6. Testing Strategy Design

#### 6.1 Test Data Preparation

- [ ] Design test fixtures for empty storage scenario
- [ ] Design test fixtures for single project scenario
- [ ] Design test fixtures for 10/50/100 project scenarios
- [ ] Design test fixtures with duplicate project IDs
- [ ] Design test fixtures with invalid data
- [ ] Design test fixtures with github.com projects

#### 6.2 Test Scenarios Specification

- [ ] Define happy path test scenarios
- [ ] Define failure scenario tests (storage quota, corrupted data)
- [ ] Define rollback scenario tests
- [ ] Define cross-device sync tests
- [ ] Define performance tests (migration duration limits)
- [ ] Define data integrity verification tests

#### 6.3 TDD Approach

- [ ] Specify test-first order (which tests to write before implementation)
- [ ] Define expected input/output pairs for migration function
- [ ] Design test structure following AAA pattern (Arrange, Act, Assert)
- [ ] Specify minimal mocking strategy (only mock chrome storage APIs)
- [ ] Define test independence guarantees (no shared state)

### 7. Documentation Planning

#### 7.1 Technical Documentation

- [ ] Plan architecture decision record (ADR) for unified format choice
- [ ] Design migration algorithm flowchart
- [ ] Specify data flow diagrams for migration process
- [ ] Plan API documentation for new storage service

#### 7.2 User Documentation

- [ ] Plan user-facing migration announcement
- [ ] Design FAQ for common migration questions
- [ ] Specify troubleshooting guide for migration issues
- [ ] Plan support request templates

#### 7.3 Developer Documentation

- [ ] Plan onboarding guide for new developers
- [ ] Design code comments strategy for migration code
- [ ] Specify maintenance guide for post-migration code

---

## Deliverables

### Required Outputs

1. **Unified Storage Schema Document**: Complete field definitions, types, validation rules
2. **Migration Algorithm Specification**: Step-by-step procedure with decision points
3. **Safety Mechanisms Specification**: Backup, rollback, validation procedures
4. **Feature Flag Configuration**: Rollout stages, criteria, monitoring plan
5. **Edge Case Handling Matrix**: All scenarios with resolution strategies
6. **Test Plan Document**: Test scenarios, fixtures, expected outcomes
7. **Risk Assessment**: All identified risks with mitigation strategies

### Design Review Checklist

- [ ] Unified format includes all necessary fields from both old formats
- [ ] Migration is atomic (all-or-nothing guarantee)
- [ ] Rollback mechanism is reliable and tested
- [ ] Feature flag allows granular control
- [ ] All edge cases have defined handling
- [ ] Test plan covers all critical paths
- [ ] Documentation plan is comprehensive
- [ ] Storage quota limits are respected
- [ ] Cross-device sync conflicts are addressed
- [ ] User impact is minimized

---

## Success Criteria

**Phase 2 is complete when**:

1. Unified storage format is fully specified and reviewed
2. Migration algorithm has no ambiguous steps
3. All safety mechanisms are designed with clear procedures
4. Feature flag strategy is defined and approved
5. All known edge cases have defined handling
6. Test plan is comprehensive and reviewable
7. Risk assessment shows acceptable risk levels
8. Team consensus on design approach

**Time to proceed to Phase 3**: When all deliverables are complete and reviewed

---

## Risk Mitigation

**Design Phase Risks**:

- **Risk**: Overlooking critical edge cases
  **Mitigation**: Review existing sync service code for all handled scenarios

- **Risk**: Storage quota underestimation
  **Mitigation**: Calculate actual data sizes from production anonymized samples

- **Risk**: Migration complexity too high
  **Mitigation**: Simplify by prioritizing data preservation over perfect optimization

- **Risk**: Rollback mechanism unreliable
  **Mitigation**: Design rollback as simple restore from backup, test extensively

---

## Next Phase Preparation

**Before Phase 3 (Implementation)**:

- [ ] All design documents reviewed and approved
- [ ] Test plan validated against design
- [ ] Edge cases confirmed with actual user data patterns
- [ ] Team has full understanding of migration approach
- [ ] Development environment ready for TDD workflow
