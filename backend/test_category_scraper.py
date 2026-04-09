#!/usr/bin/env python3
"""
Test script for the category scraper functionality.
Tests the scrape_category() method with various categories.
"""

import asyncio
import json
import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from src.services.scraper import CategoryScraper, scrape_category


async def test_unique_category():
    """Test scraping the Unique category."""
    print("=" * 80)
    print("Test 1: Scrape Unique Category")
    print("=" * 80)

    try:
        result = await scrape_category(
            category_name="Unique",
            url="https://poedb.tw/us/Unique",
            follow_pagination=False  # Don't follow pagination for quick test
        )

        print(f"✓ Category: {result['category']}")
        print(f"✓ Page Title: {result['page_title']}")
        print(f"✓ Source URL: {result['url']}")
        print(f"✓ Items Found: {result['total_items']}")
        print(f"✓ Pages Scraped: {result['pages_scraped']}")

        # Show first few items
        print("\nFirst 5 items:")
        for i, item in enumerate(result['items'][:5], 1):
            print(f"  {i}. {item['title']} -> {item['url']}")

        # Verify structure
        if result['items']:
            first_item = result['items'][0]
            assert 'title' in first_item, "Missing 'title' field"
            assert 'url' in first_item, "Missing 'url' field"
            assert 'category' in first_item, "Missing 'category' field"
            assert 'source_page' in first_item, "Missing 'source_page' field"
            assert 'metadata' in first_item, "Missing 'metadata' field"
            print("\n✓ All required fields present in items")

        # Save results to JSON for review
        output_file = Path(__file__).parent / "test_results_unique.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"✓ Results saved to {output_file}")

        return True, result

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False, None


async def test_gem_category():
    """Test scraping the Gem category."""
    print("\n" + "=" * 80)
    print("Test 2: Scrape Gem Category")
    print("=" * 80)

    try:
        result = await scrape_category(
            category_name="Gem",
            url="https://poedb.tw/us/Gem",
            follow_pagination=False
        )

        print(f"✓ Category: {result['category']}")
        print(f"✓ Page Title: {result['page_title']}")
        print(f"✓ Items Found: {result['total_items']}")
        print(f"✓ Pages Scraped: {result['pages_scraped']}")

        # Show first few items
        print("\nFirst 5 items:")
        for i, item in enumerate(result['items'][:5], 1):
            print(f"  {i}. {item['title']} -> {item['url']}")

        # Save results
        output_file = Path(__file__).parent / "test_results_gem.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"✓ Results saved to {output_file}")

        return True, result

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False, None


async def test_passive_skill_category():
    """Test scraping the Passive_Skill category."""
    print("\n" + "=" * 80)
    print("Test 3: Scrape Passive_Skill Category")
    print("=" * 80)

    try:
        result = await scrape_category(
            category_name="Passive_Skill",
            url="https://poedb.tw/us/Passive_Skill",
            follow_pagination=False
        )

        print(f"✓ Category: {result['category']}")
        print(f"✓ Page Title: {result['page_title']}")
        print(f"✓ Items Found: {result['total_items']}")
        print(f"✓ Pages Scraped: {result['pages_scraped']}")

        # Show first few items
        print("\nFirst 5 items:")
        for i, item in enumerate(result['items'][:5], 1):
            print(f"  {i}. {item['title']} -> {item['url']}")

        # Save results
        output_file = Path(__file__).parent / "test_results_passive.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"✓ Results saved to {output_file}")

        return True, result

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False, None


async def test_with_scraper_instance():
    """Test using CategoryScraper class directly."""
    print("\n" + "=" * 80)
    print("Test 4: Using CategoryScraper class directly")
    print("=" * 80)

    try:
        async with CategoryScraper() as scraper:
            result = await scraper.scrape_category(
                category_name="Unique",
                url="https://poedb.tw/us/Unique"
            )

        print(f"✓ Successfully used CategoryScraper instance")
        print(f"✓ Items extracted: {result['total_items']}")
        print(f"✓ Pages scraped: {result['pages_scraped']}")

        return True, result

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False, None


async def test_metadata_extraction():
    """Test that metadata is properly captured."""
    print("\n" + "=" * 80)
    print("Test 5: Metadata Extraction")
    print("=" * 80)

    try:
        result = await scrape_category(
            category_name="Unique",
            url="https://poedb.tw/us/Unique",
            follow_pagination=False
        )

        # Check metadata in items
        items_with_metadata = [item for item in result['items'] if item['metadata']]
        print(f"✓ Items with metadata: {len(items_with_metadata)}/{len(result['items'])}")

        if items_with_metadata:
            print("\nExample metadata:")
            for item in items_with_metadata[:3]:
                print(f"  - {item['title']}: {item['metadata']}")

        return True, result

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False, None


async def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("CATEGORY SCRAPER TEST SUITE")
    print("=" * 80)

    tests = [
        ("Unique Category", test_unique_category),
        ("Gem Category", test_gem_category),
        ("Passive Skill Category", test_passive_skill_category),
        ("Scraper Instance", test_with_scraper_instance),
        ("Metadata Extraction", test_metadata_extraction),
    ]

    results = []
    for test_name, test_func in tests:
        try:
            success, result = await test_func()
            results.append((test_name, success, result))
        except Exception as e:
            print(f"\n✗ Test '{test_name}' failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False, None))

    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)

    passed = sum(1 for _, success, _ in results if success)
    total = len(results)

    for test_name, success, _ in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status}: {test_name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n✓ All tests passed!")
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
