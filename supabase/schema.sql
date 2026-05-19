-- SenterPuls database schema
-- Run this in Supabase SQL Editor

CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  instagram_handle TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  original_text TEXT NOT NULL,
  original_url TEXT,
  image_urls TEXT[],
  scraped_at TIMESTAMPTZ DEFAULT now(),
  content_hash TEXT UNIQUE
);

CREATE TABLE suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  relevance_score INTEGER CHECK (relevance_score BETWEEN 1 AND 100),
  suggested_text JSONB,
  channels TEXT[],
  status TEXT DEFAULT 'new',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access" ON stores FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON content FOR SELECT USING (true);
CREATE POLICY "Allow all access" ON suggestions USING (true) WITH CHECK (true);

INSERT INTO stores (name, url, category) VALUES
  ('Apotek 1', 'https://www.apotek1.no', 'helse'),
  ('Anton Sport', 'https://www.antonsport.no', 'sport'),
  ('Bj\u00f8rklund', 'https://www.bjorklund.no', 'gull'),
  ('CEWE Japan Photo', 'https://www.japanphoto.no', 'foto'),
  ('Clas Ohlson', 'https://www.clasohlson.com/no', 'hjem'),
  ('Feel', 'https://www.feel.no', 'helse'),
  ('Funky Frozen Yogurt', 'https://www.ffy.no', 'mat'),
  ('GANT', 'https://www.gant.no', 'mote'),
  ('Glitter', 'https://www.glitter.no', 'tilbeh\u00f8r'),
  ('H\u00e6ll\u00e6', 'https://www.haellae.no', 'mat'),
  ('Jernia', 'https://www.jernia.no', 'hjem'),
  ('Kid Interi\u00f8r', 'https://www.kid.no', 'interi\u00f8r'),
  ('Kitch\'\'n', 'https://www.kitchn.no', 'kj\u00f8kken'),
  ('Lekia', 'https://www.lekia.no', 'leker'),
  ('Life', 'https://www.life.no', 'helse'),
  ('Mester Gr\u00f8nn', 'https://www.mestergronn.no', 'blomster'),
  ('Nille', 'https://www.nille.no', 'lavpris'),
  ('Nikita Hair', 'https://www.nikita.no', 'fris\u00f8r'),
  ('Normal', 'https://www.normal.no', 'lavpris'),
  ('Norli', 'https://www.norli.no', 'b\u00f8ker'),
  ('N\u00e6ss', 'https://www.naess.as', 'sko'),
  ('Outland', 'https://www.outland.no', 'underholdning'),
  ('Presangen', 'https://www.presangen.no', 'gaver'),
  ('Rituals', 'https://www.rituals.com/nb-no/home', 'duft'),
  ('Rino Hansen', 'https://rinohansen.no', 'sko'),
  ('SmoothieXchange', 'https://www.smoothiexchange.no', 'mat'),
  ('Synsam', 'https://www.synsam.no', 'optikk'),
  ('Telenor', 'https://www.telenor.no', 'tele'),
  ('Trio Barn', 'https://triobarn.no', 'barn'),
  ('VIC', 'https://www.vic.no', 'mote'),
  ('Vinmonopolet', 'https://www.vinmonopolet.no', 'drikke'),
  ('Vita', 'https://www.vita.no', 'helse'),
  ('Matv\u00e6rste', 'https://matvaerste.no', 'mat'),
  ('Obs Fredrikstad', 'https://www.obs.no', 'dagligvare'),
  ('Power', 'https://www.power.no', 'elektronikk'),
  ('EVO Fitness', 'https://evofitness.no', 'trening'),
  ('Therese M', 'https://www.theresem.no', 'mote');