#!/usr/bin/env python3
"""
Script to add test data to ChromaDB and test RAG chain retrieval.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from langchain_core.documents import Document
from src.services.vector_store import VectorStore

print("Adding test data to ChromaDB...")

# Initialize vector store
vector_store = VectorStore()

# Create test documents for POE2 data
poe2_docs = [
    Document(
        page_content="Blood Mage is an ascendancy class for the Witch in Path of Exile 2. "
        It focuses on life and blood magic mechanics. Blood Mage skills include:
        - Sanguimancy: Life recovery on spell use
        - Bloodshot: Chaos damage based on life spent
        - Vitality Siphon: Steal life from enemies
        The ascendancy is powerful for life-based builds and offers good sustainability.",
        metadata={"game": "poe2", "source": "https://poedb.tw/us/Blood_Mage", "category": "ascendancy"}
    ),
    Document(
        page_content="Warlock is an ascendancy class for the Witch in Path of Exile 2. "
        It focuses on chaos damage and curse skills. Warlock features include:
        - Chaos Magic: Chaos damage scaling
        - Curse Mastery: Enhanced curse effects
        - Soul Harvest: Gain power from cursed enemies
        This ascendancy excels at chaos-based builds and offers strong offensive capabilities.",
        metadata={"game": "poe2", "source": "https://poedb.tw/us/Warlock", "category": "ascendancy"}
    ),
    Document(
        page_content="Necromancer is an ascendancy class for the Witch in Path of Exile 1. "
        it focuses on minions and corpse skills. Necromancer features include:
        - Command Corps: Minion damage and speed
        - Corpse Pact: Minion life scaling
        - Mistress of Sacrifice: Offer bonuses for sacrificing minions
        This ascendancy is popular for summoner builds and provides strong minion support.",
        metadata={"game": "poe1", "source": "https://poedb.tw/us/Necromancer", "category": "ascendancy"}
    ),
    Document(
        page_content="Elementalist is an ascendancy class for the Witch in Path of Exile 1. "
        It focuses on elemental skills and golemancy. Elementalist features include:
        - Elemental Mastery: Enhanced elemental damage
        - Golemancer: Strong golem support
        - Heart of the Elements: Elemental resistance and damage
        This ascendancy is versatile and works well with spell-focused builds.",
        metadata={"game": "poe1", "source": "https://poedb.tw/us/Elementalist", "category": "ascendancy"}
    ),
    Document(
        page_content="Wands skills in Path of Exile 2 include:
        - Spark: Fire projectile with lightning damage
        - Fireball: Area of effect fire spell
        - Flame Wall: Create a barrier of flames
        - Rolling Magma: Fire damage while moving
        Wands are essential for spellcasters and provide good clear speed and area damage.",
        metadata={"game": "poe2", "source": "https://poedb.tw/us/Wands", "category": "skills"}
    ),
    Document(
        page_content="wands skills in Path of Exile 1 include:
        - Fireball: Classic area of effect fire spell
        - Flame Surge: Fire damage in a line
        - Combustion: Ignite enemies on fire
        - Rolling Flame: Mobile fire damage
        These skills are great for clearing packs of enemies and provide good leveling speed.",
        metadata={"game": "poe1", "source": "https://poedb.tw/us/Wands_Poe1", "category": "skills"}
    ),
]

# Create test documents with POE1 build context
poe1_build_docs = [
    Document(
        page_content="W Witch Blood Mage build focuses on maximizing life pool and blood magic. "
        - Key skills: Sanguimancy, Bloodshot, Vitality Siphon
        - Recommended items: Life regeneration, chaos damage modifiers
        - Playstyle: Tanky caster with good sustain",
        metadata={
            "game": "poe2",
            "source": "https://maxroll.gg/poe2-witch-blood-mage",
            "category": "build_guide",
            "build_context": "Witch - Blood Mage"
        }
    ),
    Document(
        page_content="M Marauder Berserker build focuses on raw physical damage and warcries. "
        - Key skills: Rage, Warcry, rallying cry
        - Recommended items: Physical damage, attack speed, life
        - Playstyle: Melee DPS with high survivability",
        metadata={
            "game": "poe1",
            "source": "https://maxroll.gg/poe1-marauder-berserker",
            "category": "build_guide",
            "build_context": "Marauder - Berserker"
        }
    ),
]

try:
    # Add documents to vector store
    ids = vector_store.add_documents(poe2_docs)
    print(f"✓ Added {len(ids)} PoE2 documents")

    ids = vector_store.add_documents(poe1_build_docs)
    print(f"✓ Added {len(ids)} POE1 build documents")

    # Add some documents with specific build context
    build_docs = [
        Document(
            page_content="Blood Mage Witch build for beginners - focus on life regeneration and simple skills.",
            metadata={
                "game": "poe2",
                "source": "https://poe2.wiki/blood_mage",
                "build_context": "Witch - Blood Mage",
            }
        ),
    ]
    ids = vector_store.add_documents(build_docs)
    print(f"✓ Added {len(ids)} build-specific documents")

    print("\nTest data added successfully!")
    print("\nNow testing RAG chain retrieval...")

    # Import RAG chain
    from src.services.rag_chain import RAGChain, get_rag_chain

    rag = get_rag_chain()

    # Test 1: Retrieve for POE2
    print("\n1. Testing retrieve() with game='poe2'")
    result1 = rag.retrieve(
        query="Blood Mage ascendancy skills",
        game="poe2",
        top_k=3
    )
    print(f"Query: {result1.query}")
    print(f"Game: {result1.game}")
    print(f"Documents found: {len(result1.documents)}")
    print(f"Citations: {len(result1.citations)}")

    if result1.documents:
        print("\nDocuments retrieved:")
        for i, doc in enumerate(result1.documents):
            print(f"\n{i+1}. Content preview: {doc.page_content[:100]}...")
            print(f"   Metadata: {doc.metadata}")
    else:
        print("No documents found (expected for empty database)")

    print()

    # Test 2: Retrieve for POE1
    print("\n2. Testing retrieve() with game='poe1'")
    result2 = rag.retrieve(
        query="Necromancer minion skills",
        game="poe1",
        top_k=3,
    )
    print(f"Query: {result2.query}")
    print(f"Game: {result2.game}")
    print(f"Documents found: {len(result2.documents)}")
    print(f"Citations: {len(result2.citations)}")
    if result2.documents:
        print("\nDocuments retrieved:")
        for i, doc in enumerate(result2.documents):
            print(f"\n{i+1}. Content preview: {doc.page_content[:100]}...")
            print(f"   Metadata: {doc.metadata}")
    else:
        print("No documents found (expected for empty database)")

    print()

    # Test 3: Retrieve with build context
    print("\n3. Testing retrieve() with build_context")
    result3 = rag.retrieve(
        query="best skills",
        game="poe2",
        build_context="Witch - Blood Mage",
        top_k=3,
    )
    print(f"Query: {result3.query}")
    print(f"Game: {result3.game}")
    print(f"Build context: {result3.build_context}")
    print(f"Documents found: {len(result3.documents)}")
    print(f"Citations: {len(result3.citations)}")
    if result3.documents:
        print("\nDocuments retrieved")
        for i, doc in enumerate(result3.documents):
            print(f"\n{i+1}. Content preview: {doc.page_content[:100]}...")
            print(f"   Metadata: {doc.metadata}")
    else:
        print("No documents found (expected for empty database)")
    print()

    # Test 4: Test top-k parameter
    print("\n4. Testing top-k parameter (k=2)")
    result_k = rag.retrieve(
        query="Blood Mage",
        game="poe2",
        top_k=2,
    )
    print(f"Requested k=2, got {len(result_k.documents)} documents")

    result_k = rag.retrieve(
        query="Blood Mage",
        game="poe2",
        top_k=1,
    )
    print(f"Requested k=1, got {len(result_k.documents)} documents")
    print()
    print("\n5. Testing convenience methods")
    result_poe1 = rag.retrieve_for_poe1(query="test", top_k=2)
    result_poe2 = rag.retrieve_for_poe2(query="test", top_k=2)
    print(f"retrieve_for_poe1: game={result_poe1.game}")
    print(f"retrieve_for_poe2: game={result_poe2.game}")
    print()
    print("\n6. Testing get_context()")
    context = rag.get_context(
        query="Blood Mage skills",
        game="poe2",
        top_k=2
    )
    print(f"Context text length: {len(context)} chars")
    print(f"Context preview: {context[:200]}...")
    print()
    print("\n7. Testing health check")
    health = rag.health_check()
    print(f"Health status: {health['status']}")
    print(f"Message: {health['message']}")
    print()
    print("\n" + "="*60)
    print("RAG CHAIN TEST COMPLETE!")
    print("="*60)
