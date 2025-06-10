# Scratchpad Helper Commands

## Quick Update Commands

### Update Current Focus

```bash
# Mark yourself as active
echo "### Session [N]: $(date +%Y-%m-%d)
**Agent**: [Your Name]
**Status**: 🟡 ACTIVE
**Focus**: [What you're working on]

#### Current Task
[Specific current task]

#### Immediate Next Steps
- [ ] [Next step 1]
- [ ] [Next step 2]

#### Blockers
[Any current blockers]

#### Notes
[Current observations]
" >> .claude/scratchpads/current-focus.md
```

### Log a Discovery

```bash
# Template for logging discoveries
echo "### [Discovery Title]
**Discovery Date**: $(date +%Y-%m-%d)
**Discovered By**: [Your Name]
**Category**: [Bug | Insight | Issue | Improvement]
**Priority**: [🔴 High | 🟡 Medium | 🟢 Low]
**Status**: 📋 TODO

**Description**:
[What you found]

**Impact**:
[How this affects things]

**Recommended Action**:
[What should be done]

**Related Files**:
- [file:line]

**Notes**:
[Additional context]
" >> .claude/scratchpads/discoveries.md
```

### Add Coordination Message

```bash
# Post a coordination message
echo "### $(date +%Y-%m-%d\ %H:%M) - [Message Title]
**From**: [Your Name]
**To**: [Target Agent or 'Any Future Agent']
**Priority**: [🔴 High | 🟡 Medium | 🟢 Low]
**Status**: 📋 ACTIVE

**Message**:
[Your message content]

**Next Agent Should**:
[Actionable items for next agent]

**Context Needed**:
[Important background]

**Files Modified**:
[List of changed files]

---
" >> .claude/scratchpads/coordination.md
```

### Record a Decision

```bash
# Log a decision made
echo "### Decision [XXX]: [Decision Title]
**Date**: $(date +%Y-%m-%d)
**Decided By**: [Your Name]
**Status**: ✅ IMPLEMENTED
**Impact**: [Foundation | High | Medium | Low]

**Decision**:
[What was decided]

**Rationale**:
[Why this decision was made]

**Alternatives Considered**:
- [Option 1]
- [Option 2]

**Implementation**:
[How this was implemented]

**Review Date**: [Future date]

---
" >> .claude/scratchpads/decisions.md
```

### Update Test Inventory

```bash
# Add a new test to inventory
echo "### [Test Name]
**File**: \`path/to/test.test.ts\`
**Status**: 📋 TODO
**Priority**: 🔴 High
**Category**: [Unit | Integration | E2E]
**Coverage**: TBD
**Created By**: [Your Name]
**Last Updated**: $(date +%Y-%m-%d)

**Description**:
[What this test covers]

**Test Cases**:
- [ ] [Test case 1]
- [ ] [Test case 2]

**Dependencies**:
[Dependencies]

**Notes**:
[Implementation notes]

---
" >> .claude/scratchpads/test-inventory.md
```

## Status Check Commands

### Quick Status Overview

```bash
echo "=== SCRATCHPAD STATUS CHECK ==="
echo "Date: $(date)"
echo ""
echo "=== CURRENT FOCUS ==="
tail -20 .claude/scratchpads/current-focus.md | grep -E "(Status|Agent|Focus)"
echo ""
echo "=== RECENT DISCOVERIES ==="
tail -10 .claude/scratchpads/discoveries.md | grep -E "(Discovery Date|Priority|Status)"
echo ""
echo "=== COORDINATION MESSAGES ==="
tail -10 .claude/scratchpads/coordination.md | grep -E "(From|Priority|Status)"
echo ""
echo "=== RECENT DECISIONS ==="
tail -10 .claude/scratchpads/decisions.md | grep -E "(Date|Decided By|Status)"
```

### Check for Pending Items

```bash
echo "=== PENDING ITEMS CHECK ==="
echo "Pending Discoveries:"
grep -n "Status.*TODO" .claude/scratchpads/discoveries.md || echo "None"
echo ""
echo "Active Coordination:"
grep -n "Status.*ACTIVE" .claude/scratchpads/coordination.md || echo "None"
echo ""
echo "Pending Decisions:"
grep -n "Status.*PENDING" .claude/scratchpads/decisions.md || echo "None"
echo ""
echo "TODO Tests:"
grep -n "Status.*TODO" .claude/scratchpads/test-inventory.md || echo "None"
```

### Master Plan Progress

```bash
echo "=== MASTER PLAN PROGRESS ==="
grep -E "- \[[ x]\]" .claude/scratchpads/testing-master-plan.md | \
sed 's/^[[:space:]]*//' | \
while read line; do
  if [[ $line == *"[x]"* ]]; then
    echo "✅ $line"
  else
    echo "⏳ $line"
  fi
done
```

## File Management Commands

### Backup Scratchpads

```bash
# Create timestamped backup
BACKUP_DIR=".claude/scratchpads/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp .claude/scratchpads/*.md "$BACKUP_DIR/"
echo "Scratchpads backed up to $BACKUP_DIR"
```

### Search Across Scratchpads

```bash
# Search for specific term across all scratchpads
SEARCH_TERM="$1"
echo "=== SEARCHING FOR: $SEARCH_TERM ==="
for file in .claude/scratchpads/*.md; do
  echo "=== $(basename $file) ==="
  grep -n -i "$SEARCH_TERM" "$file" || echo "No matches"
  echo ""
done
```

### Validate Scratchpad Structure

```bash
echo "=== VALIDATING SCRATCHPAD STRUCTURE ==="
REQUIRED_FILES=(
  "testing-master-plan.md"
  "current-focus.md"
  "discoveries.md"
  "test-inventory.md"
  "coordination.md"
  "decisions.md"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [[ -f ".claude/scratchpads/$file" ]]; then
    echo "✅ $file exists"
  else
    echo "❌ $file missing"
  fi
done
```

## Session Management

### Start Work Session

```bash
# Template for starting a new work session
SESSION_NUM=$(grep -c "### Session" .claude/scratchpads/current-focus.md)
NEW_SESSION=$((SESSION_NUM + 1))

echo "Starting Session $NEW_SESSION"
echo "1. Update current-focus.md with your session"
echo "2. Check coordination.md for messages"
echo "3. Review discoveries.md for context"
echo "4. Check test-inventory.md for current state"
echo "5. Review master plan progress"
```

### End Work Session

```bash
# Template for ending a work session
echo "Ending Work Session Checklist:"
echo "1. [ ] Update session status to COMPLETE in current-focus.md"
echo "2. [ ] Log any discoveries in discoveries.md"
echo "3. [ ] Update test-inventory.md with progress"
echo "4. [ ] Post handoff message in coordination.md"
echo "5. [ ] Update master plan progress if applicable"
echo "6. [ ] Record any decisions made in decisions.md"
```

## Usage Examples

### Example: Starting a new testing task

````bash
# 1. Check current state
bash -c "$(cat .claude/commands/scratchpad-helpers.md | sed -n '/Quick Status Overview/,/^```$/p' | sed '1d;$d')"

# 2. Start your session
# Update current-focus.md with your session details

# 3. As you work, log discoveries
# Use the discovery template when you find issues

# 4. Update progress
# Keep test-inventory.md current as you create/modify tests

# 5. Coordinate with others
# Post messages in coordination.md when needed
````

### Example: Handoff to next agent

```bash
# 1. Complete your current work
# 2. Update all relevant scratchpads
# 3. Post handoff message with clear next steps
# 4. Update master plan progress
# 5. Mark your session as COMPLETE
```
