# Security Specification - SforbiciaSmart

This specification defines the security invariants, access control behaviors, and vulnerability checks for the SforbiciaSmart application.

## 1. Data Invariants
- No document across `salons`, `categories`, `services`, `customers`, `appointments`, or `custom_prices` can be read or modified unless the authenticated user is the legitimate `ownerId`.
- Re-assigning or spoofing the `ownerId` of an existing document to bypass ACL is strictly blocked.
- Path variables (IDs) must conform to strict format limits to prevent resource exhaustion and injection.

## 2. The "Dirty Dozen" Threat Payloads
The security rules are designed to block the following malicious scenarios:
1. **Unauthenticated Read on Salons**: Attempting to list all salons without sign-in.
2. **Foreign Customer Reading**: Authenticated user trying to scrape another manager's customer details.
3. **Salon ID Injection**: Registering a salon with a multi-megabyte junk string as its ID.
4. **Owner Spoofing on Creation**: Attempting to submit a service payload with a different administrator's `ownerId`.
5. **Ownership Tampering on Update**: Trying to edit a salon doc to swap the `ownerId` field to another user.
6. **Status Step-Jumping**: Standard users trying to complete or confirm non-owned appointments.
7. **Negative Services Pricing**: Setting price fields below zero.
8. **Giant Phone String Injection**: Squeezing a 10KB string into a customer's phone field to exploit db storage limits.
9. **Illegal Empty Strings**: Creating category documents with empty names.
10. **Custom Price Interception**: Scraping VIP rates table entries belonging to other salons.
11. **Malicious Array Bloat**: Injecting high volumes of fake IDs into service's `salonIds` array.
12. **PII Blanket Scrape**: Running a blanket read query on the customers collection.

## 3. Recommended Test Suite Structure
The firestore.rules ensures all 12 threats above yield `PERMISSION_DENIED`.
