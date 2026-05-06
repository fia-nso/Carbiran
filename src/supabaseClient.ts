import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =  'https://bzbjtjwixhmyzmaezywr.supabase.co/';

const supabaseKey =  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Ymp0andpeGhteXptYWV6eXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDcwMzUsImV4cCI6MjA5MzU4MzAzNX0.h8TtCB_hzPU1xB52DhHjgmRO0Td-4pIOIx0MYLJha7U';

export const supabase = createClient(supabaseUrl, supabaseKey);
