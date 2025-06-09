
-- Create table to cache fact-check results
CREATE TABLE public.fact_checks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    input_text text NOT NULL,
    text_hash text UNIQUE NOT NULL, -- Hash of input text for deduplication
    status text NOT NULL CHECK (status IN ('real', 'fake', 'uncertain')),
    confidence integer NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    justification text NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb,
    search_results jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for fast lookups
CREATE INDEX idx_fact_checks_text_hash ON public.fact_checks(text_hash);
CREATE INDEX idx_fact_checks_created_at ON public.fact_checks(created_at DESC);

-- Enable RLS
ALTER TABLE public.fact_checks ENABLE ROW LEVEL SECURITY;

-- Allow read access to all users (no authentication required for this app)
CREATE POLICY "Allow read access to all users" ON public.fact_checks
    FOR SELECT USING (true);

-- Allow insert access to all users
CREATE POLICY "Allow insert access to all users" ON public.fact_checks
    FOR INSERT WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_fact_checks_updated_at 
    BEFORE UPDATE ON public.fact_checks 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
