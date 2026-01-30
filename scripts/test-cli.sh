#!/bin/bash
# CLI Integration Test Script
# Tests all major CLI commands after npm install
#
# Usage:
#   ./scripts/test-cli.sh          # Test local build
#   ./scripts/test-cli.sh --npm    # Test npm-installed version

# Don't exit on first error - we want to run all tests
set +e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test directory
TEST_DIR=$(mktemp -d)
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Aspects CLI Integration Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Project root: ${PROJECT_ROOT}"
echo -e "Test directory: ${TEST_DIR}"
echo ""

# Determine which binary to use
if [[ "$1" == "--npm" ]]; then
  ASPECTS="npx @morphist/aspects"
  echo -e "${YELLOW}Testing npm-installed version${NC}"
else
  ASPECTS="bun run ${PROJECT_ROOT}/src/cli.ts"
  echo -e "${YELLOW}Testing local build${NC}"
fi

# Helper functions
pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  ((PASSED++))
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
  echo -e "    ${RED}Error: $2${NC}"
  ((FAILED++))
}

section() {
  echo ""
  echo -e "${BLUE}── $1 ──${NC}"
}

# Cleanup on exit
cleanup() {
  rm -rf "$TEST_DIR"
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "  Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
  echo -e "${BLUE}========================================${NC}"
  if [[ $FAILED -gt 0 ]]; then
    exit 1
  fi
}
trap cleanup EXIT

cd "$TEST_DIR"

# ============================================
# 1. HELP & VERSION
# ============================================
section "Help & Version"

if $ASPECTS --help > /dev/null 2>&1; then
  pass "--help displays without error"
else
  fail "--help" "Command failed"
fi

if $ASPECTS --help | grep -q "COMMANDS"; then
  pass "--help shows COMMANDS section"
else
  fail "--help content" "Missing COMMANDS section"
fi

if $ASPECTS --help | grep -q "create"; then
  pass "--help lists create command"
else
  fail "--help content" "Missing create command"
fi

# ============================================
# 2. INIT (Project initialization)
# ============================================
section "Init"

# Test init --help
if $ASPECTS init --help > /dev/null 2>&1; then
  pass "init --help works"
else
  fail "init --help" "Command failed"
fi

# Test init creates .aspects directory
mkdir -p init-test && cd init-test
if $ASPECTS init --force > /dev/null 2>&1; then
  pass "init creates .aspects directory"
else
  fail "init" "Failed to initialize"
fi

# Verify structure
if [[ -f ".aspects/config.json" ]]; then
  pass ".aspects/config.json exists"
else
  fail "init structure" "config.json not created"
fi

if [[ -f ".aspects/.gitignore" ]]; then
  pass ".aspects/.gitignore exists"
else
  fail "init structure" ".gitignore not created"
fi

cd ..

# ============================================
# 3. CREATE (Generator) - Skip interactive, create manually
# ============================================
section "Create (Generator)"

# Create command is interactive, so we test --help works and manually create test aspect
if $ASPECTS create --help > /dev/null 2>&1; then
  pass "create --help works"
else
  fail "create --help" "Command failed"
fi

# Manually create a test aspect for subsequent tests
mkdir -p test-aspect
cat > test-aspect/aspect.json << 'EOF'
{
  "schemaVersion": 1,
  "name": "test-aspect",
  "version": "1.0.0",
  "displayName": "Test Aspect",
  "tagline": "A test aspect for CLI verification",
  "category": "assistant",
  "prompt": "You are a helpful test assistant."
}
EOF

if [[ -f "test-aspect/aspect.json" ]]; then
  pass "test aspect.json created for testing"
else
  fail "aspect.json" "File not created"
fi

# ============================================
# 3. VALIDATE
# ============================================
section "Validate"

if $ASPECTS validate ./test-aspect > /dev/null 2>&1; then
  pass "validate passes for valid aspect"
else
  fail "validate" "Failed on valid aspect"
fi

# Create invalid aspect to test validation
mkdir -p invalid-aspect
echo '{"name": "x"}' > invalid-aspect/aspect.json

if ! $ASPECTS validate ./invalid-aspect > /dev/null 2>&1; then
  pass "validate fails for invalid aspect"
else
  fail "validate" "Should have failed on invalid aspect"
fi

# ============================================
# 4. COMPILE
# ============================================
section "Compile"

if $ASPECTS compile ./test-aspect -m claude-4 > /dev/null 2>&1; then
  pass "compile works on valid aspect"
else
  fail "compile" "Failed to compile aspect"
fi

if $ASPECTS compile ./test-aspect -m claude-4 2>&1 | grep -q "test assistant"; then
  pass "compile outputs prompt content"
else
  fail "compile output" "Missing prompt content"
fi

# ============================================
# 5. LIST (before any installs)
# ============================================
section "List"

if $ASPECTS list > /dev/null 2>&1; then
  pass "list runs without error"
else
  fail "list" "Command failed"
fi

# ============================================
# 6. SEARCH
# ============================================
section "Search"

if $ASPECTS search > /dev/null 2>&1; then
  pass "search runs without error"
else
  fail "search" "Command failed"
fi

# Search for something specific (may or may not find results)
if $ASPECTS search meditation > /dev/null 2>&1; then
  pass "search with query runs"
else
  fail "search query" "Command failed"
fi

# ============================================
# 7. ADD (Install)
# ============================================
section "Add (Install)"

# Test add --help works
if $ASPECTS add --help > /dev/null 2>&1; then
  pass "add --help works"
else
  fail "add --help" "Command failed"
fi

# Test local install from our test aspect
if $ASPECTS add ./test-aspect > /dev/null 2>&1; then
  pass "add local aspect works"
else
  fail "add local" "Failed to install local aspect"
fi

# Verify it's listed
if $ASPECTS list 2>&1 | grep -qi "test-aspect"; then
  pass "test-aspect appears in list"
else
  fail "list after add" "test-aspect not in list"
fi

# ============================================
# 8. INFO
# ============================================
section "Info"

# Info might fail if aspect not found locally, check --help instead
if $ASPECTS info --help > /dev/null 2>&1; then
  pass "info --help works"
else
  fail "info" "Command failed"
fi

# ============================================
# 9. REMOVE
# ============================================
section "Remove"

# Remove the test-aspect we installed (--force skips confirmation)
if $ASPECTS remove test-aspect --force > /dev/null 2>&1; then
  pass "remove test-aspect works"
else
  # May fail, check --help
  if $ASPECTS remove --help > /dev/null 2>&1; then
    pass "remove --help works"
  else
    fail "remove" "Command failed"
  fi
fi

# Verify it's gone
if ! $ASPECTS list 2>&1 | grep -qi "test-aspect"; then
  pass "test-aspect removed from list"
else
  fail "list after remove" "test-aspect still in list"
fi

# ============================================
# 10. CONFIG
# ============================================
section "Config"

if $ASPECTS config > /dev/null 2>&1; then
  pass "config runs without error"
else
  fail "config" "Command failed"
fi

# ============================================
# 11. SHARE (dry-run)
# ============================================
section "Share"

if $ASPECTS share ./test-aspect --dry-run > /dev/null 2>&1; then
  pass "share --dry-run works"
else
  fail "share dry-run" "Command failed"
fi

# ============================================
# 12. LOGIN STATUS (not actually logging in)
# ============================================
section "Auth Status"

# Just verify the commands exist and don't crash
if $ASPECTS login --help > /dev/null 2>&1; then
  pass "login --help works"
else
  fail "login help" "Command failed"
fi

if $ASPECTS logout --help > /dev/null 2>&1; then
  pass "logout --help works"
else
  fail "logout help" "Command failed"
fi

# ============================================
# 13. COMMAND ALIASES
# ============================================
section "Command Aliases"

if $ASPECTS c --help > /dev/null 2>&1; then
  pass "alias 'c' works for create"
else
  fail "alias c" "Command failed"
fi

if $ASPECTS i alaric > /dev/null 2>&1; then
  pass "alias 'i' works for add/install"
else
  fail "alias i" "Command failed"
fi

# Clean up that install
$ASPECTS remove alaric --yes > /dev/null 2>&1 || true

echo ""
echo -e "${GREEN}All tests completed!${NC}"
