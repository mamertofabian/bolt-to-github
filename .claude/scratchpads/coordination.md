# Claude Instance Coordination

## Message Board

### 2025-01-06 - Initial Setup

**From**: Primary Claude  
**To**: Future Claude Instances  
**Priority**: 🔴 High  
**Status**: 📋 ACTIVE

**Message**:
I've set up the comprehensive scratchpad system for our testing project. The foundation includes:

- Master plan with phased approach
- Current focus tracking for work coordination
- Discovery logging for bugs and insights
- Test inventory for coverage tracking
- This coordination system
- Decision log for architectural choices

**Next Agent Should**:

1. Review the master plan in `testing-master-plan.md`
2. Update their session in `current-focus.md`
3. Begin with existing test analysis
4. Log any discoveries in `discoveries.md`
5. Update test inventory as they discover existing tests

**Context Needed**:

- This is the initial setup phase
- No previous work has been done on the testing initiative
- Focus should be on analysis before implementation
- Follow the established patterns in these scratchpad files

**Files Created**:

- `.claude/scratchpads/testing-master-plan.md`
- `.claude/scratchpads/current-focus.md`
- `.claude/scratchpads/discoveries.md`
- `.claude/scratchpads/test-inventory.md`
- `.claude/scratchpads/coordination.md`
- `.claude/scratchpads/decisions.md`

---

## Message Templates

### Handoff Message

**From**: [Your Agent ID]  
**To**: [Next Agent or "Any Future Agent"]  
**Priority**: [🔴 High | 🟡 Medium | 🟢 Low]  
**Status**: [📋 ACTIVE | 🟡 WAITING | ✅ COMPLETE]

**Message**:
[Clear description of what you've done and current state]

**Next Agent Should**:
[Specific actionable steps for the next agent]

**Context Needed**:
[Important background information]

**Files Modified**:
[List of files that were changed]

### Status Update

**From**: [Your Agent ID]  
**Timestamp**: YYYY-MM-DD HH:MM  
**Type**: [🔄 Progress | ⚠️ Blocker | ✅ Completion | 🚨 Critical]

**Update**:
[Brief status update]

**Impact**:
[How this affects other work]

### Question/Request

**From**: [Your Agent ID]  
**To**: [Specific Agent or "Any Agent"]  
**Priority**: [🔴 High | 🟡 Medium | 🟢 Low]  
**Type**: ❓ QUESTION

**Question**:
[Clear question that needs answering]

**Context**:
[Why this question matters]

**Needed By**:
[When an answer is needed]

---

## Coordination Protocols

### Work Session Protocol

1. **Before Starting**: Check for active sessions and coordination messages
2. **Starting Work**: Update `current-focus.md` with your session
3. **During Work**: Post progress updates every 30-60 minutes
4. **Encountering Issues**: Post blocker messages immediately
5. **Completing Work**: Post handoff message with clear next steps

### Decision Making Protocol

1. **Small Decisions**: Document in `decisions.md` after making
2. **Medium Decisions**: Post question, wait for input if time allows
3. **Large Decisions**: Always coordinate with other agents before proceeding

### Conflict Resolution

1. **File Conflicts**: Use timestamps and agent IDs to resolve
2. **Approach Conflicts**: Document both approaches in `decisions.md`
3. **Priority Conflicts**: High priority wins, document reasoning

### Emergency Protocol

1. **Critical Issues**: Post 🚨 CRITICAL message immediately
2. **Blocking Issues**: Post ⚠️ BLOCKER message with details
3. **System Issues**: Document in `discoveries.md` with HIGH priority

---

## Active Coordination Items

### Current Coordination Needs

- Need agent to begin existing test analysis
- Need coordination on testing approach priorities
- Need agreement on coverage targets

### Pending Questions

_No pending questions currently_

### Waiting For

_No items currently waiting_

### Blockers

_No active blockers_

---

## Agent Registry

### Primary Claude (Session 1)

**Status**: 🟡 ACTIVE  
**Started**: 2025-01-06  
**Focus**: Scratchpad system setup  
**Last Update**: 2025-01-06

### [Future Agent Sessions]

_Agent sessions will be registered here as they begin work_

---

## Communication Statistics

**Total Messages**: 1  
**Active Threads**: 1  
**Resolved Issues**: 0  
**Pending Responses**: 0  
**Last Activity**: 2025-01-06
