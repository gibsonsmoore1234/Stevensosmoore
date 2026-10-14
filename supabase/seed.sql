-- Loads the starter collection: works cropped from Instagram, bundled with the site at /images/works/.
-- Titles are working titles — rename them in /admin. Safe to re-run (skips rows that already exist).

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Airship over the Glass City', 'oil', 'Oil on canvas', 'An amber sky with an airship over blue mountains, a winding oxblood road leading to a small city of pale glass blocks, and a giant seated figure holding a blimp.', '/images/works/airship-over-the-glass-city.jpg', '/images/works/airship-over-the-glass-city.jpg', 868, 510, true, 10, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/airship-over-the-glass-city.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Harlequin in Teal', 'oil', 'Oil on canvas', 'A figure in a patchwork suit of blue and grey squares reaches upward against teal, crystal-like towers.', '/images/works/teal-harlequin.jpg', '/images/works/teal-harlequin.jpg', 664, 820, true, 20, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/teal-harlequin.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Procession', 'oil', 'Oil on canvas', 'A blue-haired figure draped in pink blossoms stands before striped vertical bands under a pink sky, a small blond figure behind.', '/images/works/the-procession.jpg', '/images/works/the-procession.jpg', 690, 692, true, 30, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-procession.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Dragon Duel', 'oil', 'Oil on canvas', 'A man in a red cap fires a laser from a hose at two green dragons breathing fire across a red canyon.', '/images/works/the-dragon-duel.jpg', '/images/works/the-dragon-duel.jpg', 744, 908, true, 40, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-dragon-duel.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Three Good Dogs', 'oil', 'Oil on canvas', 'Three dogs — a yellow lab, a grey terrier on a blue leash and a black-and-white pup — sit side by side on a green ground, painted in thick impasto.', '/images/works/the-dog-pile.jpg', '/images/works/the-dog-pile.jpg', 1400, 1122, true, 50, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-dog-pile.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Angels at the Gate', 'oil', 'Oil on canvas', 'Figures in blue and green gather beneath a winged angel in a dark, richly textured arch.', '/images/works/angels-at-the-gate.jpg', '/images/works/angels-at-the-gate.jpg', 662, 844, false, 60, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/angels-at-the-gate.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Cowboy in the Clouds', 'oil', 'Oil on canvas', 'A cowboy on a brown horse rides through white clouds in a deep blue sky.', '/images/works/cowboy-in-the-clouds.jpg', '/images/works/cowboy-in-the-clouds.jpg', 1400, 959, true, 70, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/cowboy-in-the-clouds.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Garden of Everything', 'oil', 'Oil on canvas', 'A crowded, colourful scene of faces, a rainbow, animals and a tiny city spilling down the canvas.', '/images/works/the-garden-of-everything.jpg', '/images/works/the-garden-of-everything.jpg', 636, 738, false, 80, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-garden-of-everything.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Master in a Suit', 'oil', 'Oil on canvas', 'A green, long-eared Yoda-like figure in a yellow suit and red tie raises a glass against grey.', '/images/works/master-in-a-suit.jpg', '/images/works/master-in-a-suit.jpg', 434, 432, false, 90, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/master-in-a-suit.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Striped Shirt', 'oil', 'Oil on canvas', 'A red-faced figure in a striped shirt holds up a glass and a thin stick.', '/images/works/striped-shirt.jpg', '/images/works/striped-shirt.jpg', 720, 808, false, 100, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/striped-shirt.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Pink Hat and Hound', 'oil', 'Oil on canvas', 'A figure in a pink hat stands by a lake under a turquoise sky with a golden dog in pink foliage.', '/images/works/pink-hat-and-hound.jpg', '/images/works/pink-hat-and-hound.jpg', 690, 826, false, 110, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/pink-hat-and-hound.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Golden Face', 'oil', 'Oil on canvas', 'A large ochre face with wide eyes framed by swirling grey and silver brushwork.', '/images/works/golden-face.jpg', '/images/works/golden-face.jpg', 648, 884, false, 120, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/golden-face.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Pink Whirlpool', 'acrylic', 'Acrylic on canvas', 'Three figures, one horned, one in blue, stand above a swirling pink pool under a grey sky.', '/images/works/the-pink-whirlpool.jpg', '/images/works/the-pink-whirlpool.jpg', 534, 730, false, 130, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-pink-whirlpool.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Riders in the Red', 'acrylic', 'Acrylic on canvas', 'An archer on a blue horse and a rider on a black horse cross a red plain beneath yellow clouds.', '/images/works/riders-in-the-red.jpg', '/images/works/riders-in-the-red.jpg', 744, 858, false, 140, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/riders-in-the-red.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Falling Through Water', 'acrylic', 'Acrylic on canvas', 'A green figure tumbles through a rush of blue water against a confetti-speckled pink ground.', '/images/works/falling-through-water.jpg', '/images/works/falling-through-water.jpg', 698, 888, false, 150, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/falling-through-water.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Long Fall', 'oil', 'Oil on canvas', 'A tall narrow canvas of a figure in green shorts falling through dark red and grey.', '/images/works/the-long-fall.jpg', '/images/works/the-long-fall.jpg', 429, 1400, false, 160, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-long-fall.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Crowd in Graphite', 'drawing', 'Graphite on paper', 'A dense black-and-white drawing of tangled figures, hands and faces.', '/images/works/crowd-in-graphite.jpg', '/images/works/crowd-in-graphite.jpg', 552, 756, false, 170, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/crowd-in-graphite.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Charcoal Figure', 'charcoal', 'Charcoal on paper', 'A crouching long-haired figure built from heavy charcoal scribbles.', '/images/works/charcoal-figure.jpg', '/images/works/charcoal-figure.jpg', 554, 720, false, 180, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/charcoal-figure.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Lady with a Tree Hat', 'drawing', 'Graphite on paper', 'A sketchbook drawing of a woman wearing a hat topped with a tiny tree.', '/images/works/lady-with-a-tree-hat.jpg', '/images/works/lady-with-a-tree-hat.jpg', 552, 664, false, 190, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/lady-with-a-tree-hat.jpg');

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'Comet of Faces', 'charcoal', 'Charcoal and white pastel on paper', 'A charcoal drawing of a huge comet-like face streaking through a starry sky above a crowd of strange heads.', '/images/works/moon-faces.jpg', '/images/works/moon-faces.jpg', 1037, 1261, false, 200, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/moon-faces.jpg');

update public.site_settings set hero_artwork_id = (select id from public.artworks where image_url = '/images/works/airship-over-the-glass-city.jpg' order by id limit 1) where id = 1 and hero_artwork_id is null;
update public.artworks set detail_urls = array['/images/details/the-long-fall-1.jpg','/images/details/the-long-fall-2.jpg'] where image_url = '/images/works/the-long-fall.jpg' and coalesce(cardinality(detail_urls),0) = 0;
update public.artworks set detail_urls = array['/images/details/cowboy-in-the-clouds-1.jpg'] where image_url = '/images/works/cowboy-in-the-clouds.jpg' and coalesce(cardinality(detail_urls),0) = 0;

insert into public.artworks (title, category, medium, alt_text, image_url, thumb_url, image_width, image_height, featured, sort_order, status, published)
select 'The Red Cyclops', 'oil', 'Oil on canvas', 'Against a churning crimson ground, a bearded figure with a giant eye for a torso raises an arm above a huge sideways face and a small red-haired figure.', '/images/works/the-red-cyclops.jpg', '/images/works/the-red-cyclops.jpg', 1115, 1400, true, 15, 'available', true
where not exists (select 1 from public.artworks where image_url = '/images/works/the-red-cyclops.jpg');
update public.artworks set detail_urls = array['/images/details/moon-faces-1.jpg','/images/details/moon-faces-2.jpg','/images/details/moon-faces-3.jpg'] where image_url = '/images/works/moon-faces.jpg' and coalesce(cardinality(detail_urls),0) = 0;
