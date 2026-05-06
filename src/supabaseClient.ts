import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =  'https://rwipotdqczqwqodyzdcc.supabase.co/';

const supabaseKey =  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3aXBvdGRxY3pxd3FvZHl6ZGNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzk5ODMsImV4cCI6MjA5MzY1NTk4M30.g7kccI3tl3jgvgpchociyoLE0k6uRXFTiFVGFrr-kiA';

export const supabase = createClient(supabaseUrl, supabaseKey);
