# ALwrity LinkedIn Writer
# Phase 3 → Validate Data

---

# Objective

Build the Profile Completeness Validator.

The purpose of this phase is to evaluate whether ALwrity has enough information to understand the user's professional profile before AI analysis begins.

This phase contains NO AI.

No LLM.

No question generation.

No topic generation.

Its only responsibility is validating the Profile Context created in Phase 2.

---

# Prerequisites

Phase 1 must already be completed.

✓ LinkedIn Profile Fetch Foundation

Phase 2 must already be completed.

✓ Profile Context Builder

The validator should ONLY consume the existing `LinkedInProfileContext`.

Never read raw LinkedIn API responses.

---

# Scope

## In Scope

✅ Validate profile completeness

✅ Identify required fields

✅ Identify missing fields

✅ Calculate profile completeness percentage

✅ Return validation results

✅ Add logging

✅ Add exception handling

---

## Out of Scope

Do NOT implement

- AI Summary
- Topic Suggestions
- Dynamic Questions
- LLM
- Analytics
- Memory
- Vector Database
- Competitor Analysis
- Growth Recommendations

---

# Purpose

Before ALwrity can understand the user, it must determine whether enough profile information exists.

Example

```
LinkedIn Profile

↓

Profile Context

↓

Profile Completeness Validator

↓

Validation Result

↓

Phase 4 (Question Generator)
```

The validator should NEVER ask questions.

It only reports what information is available and what is missing.

---

# Backend Architecture

Create a dedicated service.

Suggested location

```
backend/services/linkedin/profile_validator.py
```

Single responsibility.

Validate profile completeness.

Nothing else.

---

# Responsibilities

The validator should

Read Profile Context

↓

Check required fields

↓

Identify missing fields

↓

Calculate completeness

↓

Return validation result

No AI.

No prompts.

---

# Required Fields

The following fields are considered mandatory for Phase 1.

## Personal Information

- Name
- Headline

## Professional Information

- Current Job Title
- Current Company
- About

AND

At least ONE of

- Skills
- Experience
- Education

This is sufficient for generating meaningful AI recommendations in later phases.

---

# Optional Fields

The following fields should never block profile completion.

- Location
- Followers
- Connections
- Creator Mode
- Profile Picture
- Profile URL

These improve future recommendations but are not required.

---

# Validation Rules

Example 1

```
Name ✓

Headline ✓

Job Title ✓

Company ✓

About ✓

Skills ✓
```

Result

```
Profile Complete = True
```

---

Example 2

```
Name ✓

Headline ✓

Job Title ✓

Company ✓

About ✗

Skills ✗

Experience ✗

Education ✗
```

Result

```
Profile Complete = False

Missing Fields

About

Skills / Experience / Education
```

---

# Completeness Score

Calculate a simple completeness percentage.

Formula

```
Completed Required Fields

/

Total Required Fields

×

100
```

Example

```
Required Fields

6

Completed

5

Score

83%
```

Round to the nearest integer.

This score will help future UI improvements.

---

# Validation Result Model

Return a standardized object.

Example

```json
{
    "is_profile_complete": false,

    "completeness_score": 67,

    "missing_fields": [

        "about",

        "skills"
    ],

    "optional_missing_fields": [

        "location",

        "creator_mode"
    ]
}
```

This object becomes the input for Phase 4.

---

# Logging Requirements

Use Loguru.

Every function should log.

Example

================================================

[Profile Validator]

Starting validation

================================================

```
Reading Profile Context...
```

```
Checking required fields...
```

```
Checking optional fields...
```

```
Profile completeness score: 67%
```

```
Missing fields detected:

About

Skills
```

```
Validation completed.
```

---

# Exception Handling

Use consistent exception handling.

Example

```python
try:

    logger.info("Validating LinkedIn Profile")

    ...

except Exception:

    logger.exception(
        "Failed to validate LinkedIn Profile"
    )

    raise HTTPException(
        status_code=500,
        detail="Unable to validate LinkedIn profile."
    )
```

Always log full traceback.

Never silently ignore failures.

---

# API Changes

Do NOT create a new endpoint.

Extend the existing response.

Example

GET

```
/api/linkedin-social/profile
```

Response

```json
{
    "profile": {...},

    "profile_context": {...},

    "profile_validation": {

        "is_profile_complete": false,

        "completeness_score": 67,

        "missing_fields": [

            "about",

            "skills"
        ],

        "optional_missing_fields": [

            "location"
        ]
    }
}
```

This avoids unnecessary API endpoints and keeps the workflow simple.

---

# Testing Checklist

## Complete Profile

Expected

```
Profile Complete

Score = 100%

Missing Fields = []
```

---

## Missing About

Expected

```
Profile Complete = False

Missing

About
```

---

## Missing Skills but Experience Exists

Expected

```
Profile Complete = True
```

because one of

- Skills
- Experience
- Education

exists.

---

## Empty Strings

```
""

```

should be treated as missing.

---

## Null Values

```
None

```

should be treated as missing.

---

## Whitespace

```
"     "

```

should be treated as missing.

---

# Success Criteria

Phase 3 is complete when

✅ Profile Context is validated successfully.

✅ Required fields are correctly checked.

✅ Missing fields are identified.

✅ Optional fields are identified.

✅ Completeness percentage is calculated.

✅ Validation result follows a standardized model.

✅ Detailed logging is implemented.

✅ Proper exception handling is implemented.

✅ No AI logic exists.

---

# Future Phases

The validation result produced here will be consumed by

Phase 4

Adaptive Question Generator

The Question Generator should ONLY ask questions for fields listed in

```
missing_fields
```

No validation logic should exist inside the Question Generator.

Keeping validation and question generation separate ensures the architecture remains modular, testable, and easy to maintain as ALwrity grows.