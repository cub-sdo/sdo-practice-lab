/* Anonymous class statistics (optional).
   Leave both values empty and the site sends nothing anywhere.
   To turn statistics on, create a Supabase project, run supabase/schema.sql and paste:
     supabaseUrl - Project Settings → API → Project URL      (https://xxxx.supabase.co)
     supabaseKey - Project Settings → API Keys → publishable key (sb_publishable_...)
   The publishable key is meant to be public: the database rules only let visitors ADD answers. */
window.SDO_CONFIG = {
  supabaseUrl: "",
  supabaseKey: ""
};
