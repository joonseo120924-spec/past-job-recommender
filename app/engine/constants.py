"""Tuned constants for the recommendation engine.

Every magic number the engine depends on lives here so the weights can be
revised in one place. None of these are fitted against labelled data - they are
informed defaults. Tests assert the *arithmetic* that combines them, never the
resulting score values, so retuning does not cascade into the test suite.
"""

ENGINE_VERSION = "0.1.0"

# --- feature blocks -------------------------------------------------------
# Free-text achievements are unvalidated user input, so the character n-gram
# block only nudges the ranking; the controlled skill vocabulary decides it.
TEXT_BLOCK_WEIGHT = 0.35
CHAR_NGRAM_RANGE = (2, 4)

# Token repetition encodes importance as term frequency.
REQUIRED_SKILL_REPEAT = 3
NICE_TO_HAVE_REPEAT = 1
FAMILY_TOKEN_REPEAT = 2
USER_SKILL_REPEAT = 3

# --- experience weighting -------------------------------------------------
# A role that ended 5 years ago counts half as much as the current one; the
# floor keeps a formative 15-year-old role from vanishing entirely.
RECENCY_HALF_LIFE_YEARS = 5.0
RECENCY_FLOOR = 0.15
# The second year in a job teaches more than the eighth, hence log saturation.
TENURE_SATURATION_YEARS = 5.0

# --- score blend ----------------------------------------------------------
W_SIMILARITY = 0.55
W_EXPERIENCE = 0.22
W_TRANSITION = 0.12
W_INDUSTRY = 0.11

# Cosine over short sparse documents compresses into a narrow band; this
# exponent spreads it out so ranking differences are visible. Ordinal only.
SIM_GAMMA = 0.7

# --- experience fit -------------------------------------------------------
# Years of experience considered typical for each seniority band.
SENIORITY_YEARS = {
    "junior": (0.0, 3.0),
    "mid": (3.0, 8.0),
    "senior": (7.0, 20.0),
}
UNDERQUALIFIED_FLOOR = 0.35
OVERQUALIFIED_FLOOR = 0.55
OVERQUAL_PENALTY = 0.30

# --- transition affinity --------------------------------------------------
# Derived from the dataset's own adjacent_role_ids / family fields.
TRANSITION_ADJACENT = 1.0
TRANSITION_SAME_FAMILY = 0.6
TRANSITION_SAME_ROLE = 1.0

# --- industry adjacency ---------------------------------------------------
# Industry relatedness is derived from co-occurrence across roles rather than
# hand-authored, so it reflects the taxonomy instead of a second guess.
INDUSTRY_MIN_ADJACENCY = 0.15
PREFERRED_INDUSTRY_BONUS = 0.20

# --- skill relatedness / gaps --------------------------------------------
# Two skills are "related" when they co-occur across roles. One hop only, so
# the explanation stays traceable.
SKILL_RELATED_MIN_JACCARD = 0.30
SKILL_RELATED_TOP_K = 8
RELATED_CREDIT = 0.6
MATCH_THRESHOLD = 0.75
MAX_GAPS_RETURNED = 8
MAX_MATCHED_RETURNED = 8

# --- misc -----------------------------------------------------------------
DEFAULT_TOP_K = 5
MAX_TOP_K = 20
TITLE_MATCH_MIN_SIMILARITY = 0.34
