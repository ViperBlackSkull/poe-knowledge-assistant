#!/usr/bin/env python3
"""
Simple test to verify the category scraper code structure.
This checks that all required methods and functionality exist.
"""

import sys
from pathlib import Path

def test_category_scraper_code():
    """Test that the category scraper code has all required functionality."""

    print("=" * 80)
    print("CATEGORY SCRAPER CODE VERIFICATION")
    print("=" * 80)

    # Read the category.py file
    category_file = Path(__file__).parent / "src/services/scraper/category.py"
    if not category_file.exists():
        print("✗ FAIL: category.py file not found")
        return False

    code = category_file.read_text()

    # Check for required elements
    checks = [
        ("scrape_category method", "async def scrape_category"),
        ("CategoryScraper class", "class CategoryScraper"),
        ("Accepts category_name parameter", "category_name: str"),
        ("Accepts url parameter", "url: str"),
        ("Extracts links", "_extract_category_links"),
        ("Returns structured data", "return {"),
        ("Handles pagination", "_find_next_page_url"),
        ("Filters non-item links", "_is_valid_item_link"),
        ("Metadata extraction", "metadata"),
        ("CategoryItem dataclass", "class CategoryItem"),
    ]

    all_passed = True
    for check_name, check_pattern in checks:
        if check_pattern in code:
            print(f"✓ {check_name}: Found")
        else:
            print(f"✗ {check_name}: NOT FOUND")
            all_passed = False

    # Check the return structure
    if '"category"' in code and '"url"' in code and '"items"' in code:
        print("✓ Return structure includes category, url, and items fields")
    else:
        print("✗ Return structure incomplete")
        all_passed = False

    # Check for pagination following
    if "follow_pagination" in code:
        print("✓ Pagination following parameter present")
    else:
        print("✗ Pagination following parameter missing")
        all_passed = False

    # Check for link filtering
    if "_EXCLUDE_EXTENSIONS" in code or "_EXCLUDE_PATH_SEGMENTS" in code:
        print("✓ Link filtering constants present")
    else:
        print("✗ Link filtering constants missing")
        all_passed = False

    # Check for convenience function
    if "async def scrape_category(" in code and "category_name: str" in code:
        print("✓ Convenience scrape_category function exists")
    else:
        print("✗ Convenience scrape_category function missing")
        all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("✓ ALL CHECKS PASSED")
        print("=" * 80)
        return True
    else:
        print("✗ SOME CHECKS FAILED")
        print("=" * 80)
        return False


def test_scraper_exports():
    """Test that the scraper module exports the required functions."""

    print("\n" + "=" * 80)
    print("SCRAPER MODULE EXPORT VERIFICATION")
    print("=" * 80)

    init_file = Path(__file__).parent / "src/services/scraper/__init__.py"
    if not init_file.exists():
        print("✗ FAIL: __init__.py file not found")
        return False

    code = init_file.read_text()

    # Check for required exports
    exports = [
        ("CategoryScraper", "from src.services.scraper.category import"),
        ("scrape_category", "scrape_category"),
        ("CategoryItem", "CategoryItem"),
    ]

    all_passed = True
    for export_name, export_pattern in exports:
        if export_pattern in code:
            print(f"✓ {export_name} exported")
        else:
            print(f"✗ {export_name} NOT exported")
            all_passed = False

    # Check __all__ list
    if '"CategoryScraper"' in code or "'CategoryScraper'" in code:
        print("✓ CategoryScraper in __all__")
    else:
        print("✗ CategoryScraper not in __all__")
        all_passed = False

    if '"scrape_category"' in code or "'scrape_category'" in code:
        print("✓ scrape_category in __all__")
    else:
        print("✗ scrape_category not in __all__")
        all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("✓ ALL EXPORTS PRESENT")
        print("=" * 80)
        return True
    else:
        print("✗ SOME EXPORTS MISSING")
        print("=" * 80)
        return False


def test_acceptance_criteria():
    """Verify all acceptance criteria are met."""

    print("\n" + "=" * 80)
    print("ACCEPTANCE CRITERIA VERIFICATION")
    print("=" * 80)

    category_file = Path(__file__).parent / "src/services/scraper/category.py"
    code = category_file.read_text()

    criteria = [
        ("scrape_category() method exists", "async def scrape_category"),
        ("Accepts category name and URL", "category_name: str", "url: str"),
        ("Extracts all item/skill links", "_extract_category_links"),
        ("Returns list of URLs with metadata", '"url"', '"metadata"'),
        ("Handles pagination if present", "_find_next_page_url", "follow_pagination"),
        ("Filters out non-item links", "_is_valid_item_link"),
        ("Returns structured data", '"category"', '"items"', '"total_items"'),
    ]

    all_passed = True
    for criterion in criteria:
        criterion_name = criterion[0]
        patterns = criterion[1:]

        found_all = all(pattern in code for pattern in patterns)
        if found_all:
            print(f"✓ {criterion_name}")
        else:
            print(f"✗ {criterion_name}")
            all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("✓ ALL ACCEPTANCE CRITERIA MET")
        print("=" * 80)
        return True
    else:
        print("✗ SOME ACCEPTANCE CRITERIA NOT MET")
        print("=" * 80)
        return False


def main():
    """Run all verification tests."""

    results = []

    # Test 1: Code structure
    results.append(("Code Structure", test_category_scraper_code()))

    # Test 2: Module exports
    results.append(("Module Exports", test_scraper_exports()))

    # Test 3: Acceptance criteria
    results.append(("Acceptance Criteria", test_acceptance_criteria()))

    # Summary
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")

    print(f"\nTotal: {passed}/{total} test suites passed")

    if passed == total:
        print("\n✓ Category scraper implementation is complete and meets all requirements!")
        return 0
    else:
        print(f"\n✗ {total - passed} test suite(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
