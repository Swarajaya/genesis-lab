-- ============================================================
-- GENESIS LAB - seed data (idempotent, safe to re-run)
-- Contains catalog data and synthetic demo inventory only.
-- No user accounts, no passwords, no personal data.
-- ============================================================

insert into public.experiments (slug, name, domain, tagline, objective, sort_order, is_live) values
('blood',     'Digital Blood Bank Without Blood Types', 'Healthcare & Infrastructure', 'Compatibility is a network, not a label.', 'Rank donor units against a recipient using multi-factor compatibility, logistics and urgency.', 1, true),
('nutrition', 'AI Nutrition From Waste',                'Health + Climate',            'Turn leftovers into balanced meals.',       'Convert wasted ingredients into meals with an estimated nutrition profile and waste avoided.', 2, true),
('gamezero',  'GameZero',                               'AI & Intelligent Systems',    'An AI that learns a game from one example.', 'Infer hidden game rules from demonstrations, reject contradicted hypotheses, then play.', 3, true),
('trust',     'Trust Without Identity',                 'Cybersecurity & Digital Safety', 'Prove it without revealing it.',          'Prove age >= 18 with a zero-knowledge style proof, without revealing the date of birth.', 4, true),
('object',    'One Object, 100 Lives',                  'Climate & Sustainable Technology', 'Every object has more than one future.',   'Generate and rank second-life pathways for an object with transparent assumptions.', 5, true),
('expiry',    'EXPIRY',                                 'Fintech & Digital Economy',   'Money with an expiry date.',                 'Programmable simulated money enforced by rules: purpose, recipient, cap and expiry.', 6, true)
on conflict (slug) do update set
  name = excluded.name, domain = excluded.domain, tagline = excluded.tagline,
  objective = excluded.objective, sort_order = excluded.sort_order, is_live = excluded.is_live;

insert into public.sdgs (id, title, color, description) values
(1,  'No Poverty',                         '#E5243B', 'End poverty in all its forms everywhere.'),
(2,  'Zero Hunger',                        '#DDA63A', 'End hunger, achieve food security and improved nutrition.'),
(3,  'Good Health and Well-being',         '#4C9F38', 'Ensure healthy lives and promote well-being for all.'),
(8,  'Decent Work and Economic Growth',    '#A21942', 'Promote sustained, inclusive economic growth.'),
(9,  'Industry, Innovation and Infrastructure', '#FD6925', 'Build resilient infrastructure and foster innovation.'),
(10, 'Reduced Inequalities',               '#DD1367', 'Reduce inequality within and among countries.'),
(11, 'Sustainable Cities and Communities', '#FD9D24', 'Make cities and human settlements inclusive and sustainable.'),
(12, 'Responsible Consumption and Production', '#BF8B2E', 'Ensure sustainable consumption and production patterns.'),
(13, 'Climate Action',                     '#3F7E44', 'Take urgent action to combat climate change.'),
(16, 'Peace, Justice and Strong Institutions', '#00689D', 'Build effective, accountable and inclusive institutions.'),
(17, 'Partnerships for the Goals',         '#19486A', 'Strengthen partnerships for sustainable development.')
on conflict (id) do update set title = excluded.title, color = excluded.color, description = excluded.description;

with m(slug, sdg, rel, why) as (values
('blood',     3,  'primary',   'Faster, better-informed matching supports emergency care outcomes.'),
('blood',     9,  'secondary', 'Treats blood supply as infrastructure with logistics and inventory visibility.'),
('nutrition', 2,  'primary',   'Turns food that would be discarded into usable meals.'),
('nutrition', 12, 'primary',   'Reduces household and retail food waste.'),
('nutrition', 3,  'secondary', 'Surfaces approximate nutrition to support healthier eating.'),
('nutrition', 13, 'secondary', 'Avoided food waste avoids associated emissions.'),
('gamezero',  9,  'primary',   'Demonstrates sample-efficient, explainable machine learning.'),
('gamezero',  17, 'secondary', 'Transparent reasoning is easier to audit and share.'),
('trust',     16, 'primary',   'Strengthens digital trust and protects personal privacy.'),
('trust',     10, 'secondary', 'Lets people prove eligibility without handing over full identity.'),
('trust',     9,  'secondary', 'Privacy-preserving verification is core digital infrastructure.'),
('object',    12, 'primary',   'Extends product life and keeps materials in use.'),
('object',    13, 'primary',   'Reuse and recovery avoid emissions from new production.'),
('object',    11, 'secondary', 'Reduces municipal waste volume.'),
('expiry',    8,  'primary',   'Programmable money can direct funds to their intended economic use.'),
('expiry',    1,  'secondary', 'Purpose-bound aid can protect benefits for people in need.'),
('expiry',    10, 'secondary', 'Targeted, rule-bound transfers can improve inclusion.')
)
insert into public.experiment_sdgs (experiment_id, sdg_id, relevance, rationale)
select e.id, m.sdg, m.rel, m.why from m join public.experiments e on e.slug = m.slug
on conflict (experiment_id, sdg_id) do update set relevance = excluded.relevance, rationale = excluded.rationale;

-- Synthetic demo donor units (not real people or real inventory)
insert into public.blood_inventory (donor_code, abo, rh, kell, rhc, rhe, duffy, units, distance_km, available, hours_to_expiry, is_demo) values
('D-101', 'O',  '-', 'K-', 'c+', 'E-', 'Fy(a+)', 4,  3.5, true,  300, true),
('D-102', 'O',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 6,  8.0, true,  220, true),
('D-103', 'A',  '+', 'K-', 'c+', 'E-', 'Fy(a-)', 3,  5.2, true,  180, true),
('D-104', 'A',  '-', 'K+', 'c-', 'E-', 'Fy(a+)', 2,  12.4, true, 260, true),
('D-105', 'B',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 5,  6.8, true,  120, true),
('D-106', 'B',  '-', 'K-', 'c-', 'E-', 'Fy(a-)', 1,  15.0, true, 90,  true),
('D-107', 'AB', '+', 'K-', 'c+', 'E-', 'Fy(a+)', 2,  4.1, true,  200, true),
('D-108', 'AB', '-', 'K+', 'c+', 'E+', 'Fy(a+)', 1,  22.0, false, 150, true),
('D-109', 'O',  '-', 'K+', 'c-', 'E-', 'Fy(a-)', 3,  9.9, true,  70,  true),
('D-110', 'A',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 4,  2.7, true,  280, true)
on conflict (donor_code) do update set
  abo = excluded.abo, rh = excluded.rh, kell = excluded.kell, rhc = excluded.rhc, rhe = excluded.rhe,
  duffy = excluded.duffy, units = excluded.units, distance_km = excluded.distance_km,
  available = excluded.available, hours_to_expiry = excluded.hours_to_expiry;
