# CV Parser & Data Cloud Pipeline

A full-stack application that parses CVs, authenticates users via Auth0 and Salesforce SSO, stores credentials in Supabase, and processes data through Salesforce Data Cloud to create candidate records.

## Architecture & Data Flow
* **Ingestion API:** Receives parsed CV data from Express.
* **Data Stream & DLO:** Ingests raw data into a Data Lake Object.
* **DMO & Identity Resolution:** Maps data to a Data Model Object and unifies identities.
* **Data Graph:** Exposes the unified profile.
* **Batch Apex:** Filters the Data Graph and creates new candidate records in Salesforce.

## Tech Stack
* **Frontend:** React
* **Backend:** Express.js
* **Authentication & Identity:** Auth0 & Salesforce SSO
* **Database:** Supabase (Credentials Storage)
* **Processing & Storage:** Salesforce Data Cloud (Ingestion API, DLO, DMO, Identity Resolution, Data Graph) & Apex

