# Database setup files

Everything in the Supabase project is made by these files: tables, functions, storage buckets.
Run them in number order (000 first) in the project's SQL Editor. Each one is safe to run again.

**The rule:** never change the database by hand in Supabase without adding the change here as the
next numbered file. The first project's knowledge base and picture library were made by hand, so
they were lost with it (Oct 2026) and had to be pieced back together from the code (000).

`/api/health` (unlocked as an editor) checks that every table, search function and bucket these
files make is there, and names any that are missing.
