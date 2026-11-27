import json

from ila.classroom import grounded_points


def test_classroom_grounding_keeps_visual_attribution_and_excludes_invented_numbers():
    facts = [("We studied prime factors.", "Spoken 2.0s"), ("60 = 2 x 2 x 3 x 5", "Image 1")]
    candidates = [
        {
            "topic": "Factors",
            "explanation": "The class studied prime factors.",
            "quote": facts[0][0],
        },
        {"topic": "Factors", "explanation": "60 = 2 x 2 x 3 x 5", "quote": facts[1][0]},
        {"topic": "Factors", "explanation": "12 is another example.", "quote": facts[0][0]},
        {
            "topic": "Factors",
            "explanation": "A diagram illustrates division.",
            "quote": "Division tree",
        },
    ]
    sections = {}
    grounded_points(
        lambda *_: json.dumps({"points": candidates}), "sources", facts, sections, set(), set()
    )
    assert sections["Factors"] == [
        "- The class studied prime factors. *(Spoken 2.0s)*",
        "- 60 = 2 x 2 x 3 x 5 *(Image 1)*",
    ]
