-- Demo data for local verification only (NOT shipped). Sessions are placed in the last
-- several days so the streak/week chart populate; covers resolve from Open Library.
DELETE FROM annotations;
DELETE FROM sessions;
DELETE FROM books;

INSERT INTO books (md5,title,authors,series,language,isbn,pages,percent_finished,status,rating,review,last_open,total_read_time,total_read_pages,current_chapter) VALUES
('notw','The Name of the Wind','Patrick Rothfuss','The Kingkiller Chronicle','en','9780756404741',662,0.73,'reading',NULL,NULL, CAST(strftime('%s','2026-06-01 16:00:00') AS INTEGER), 14820, 482, 'Chapter 12'),
('piranesi','Piranesi','Susanna Clarke',NULL,'en','9781635575637',272,1.0,'finished',5,'Luminous and strange — a house the size of a world.', CAST(strftime('%s','2026-02-10 10:00:00') AS INTEGER), 30000, 272, NULL),
('wmf','The Wise Man''s Fear','Patrick Rothfuss','The Kingkiller Chronicle','en','9780756407124',994,1.0,'finished',4,NULL, CAST(strftime('%s','2026-04-02 10:00:00') AS INTEGER), 61200, 994, NULL),
('educated','Educated','Tara Westover',NULL,'en','9780399590504',334,1.0,'finished',5,NULL, CAST(strftime('%s','2026-03-15 10:00:00') AS INTEGER), 40000, 334, NULL),
('dune','Dune Messiah','Frank Herbert','Dune','en','9780593098233',331,0.12,'paused',NULL,NULL, CAST(strftime('%s','2026-05-10 10:00:00') AS INTEGER), 4000, 40, NULL),
('babel','Babel','R. F. Kuang',NULL,'en','9780063021426',560,0.0,'unread',NULL,NULL,NULL,0,0,NULL);

INSERT INTO sessions (book_md5,page,start_time,duration,total_pages) VALUES
('notw',180, CAST(strftime('%s','2026-05-27 10:00:00') AS INTEGER), 2280, 662),
('notw',195, CAST(strftime('%s','2026-05-28 10:00:00') AS INTEGER), 3120, 662),
('notw',205, CAST(strftime('%s','2026-05-29 10:00:00') AS INTEGER), 1260, 662),
('notw',211, CAST(strftime('%s','2026-05-30 10:00:00') AS INTEGER), 4260, 662),
('notw',218, CAST(strftime('%s','2026-05-31 10:00:00') AS INTEGER), 2640, 662),
('notw',225, CAST(strftime('%s','2026-06-01 10:00:00') AS INTEGER), 2520, 662);

INSERT INTO annotations (book_md5,datetime,datetime_epoch,chapter,page,text,note,color,pos0,pos1) VALUES
('notw','2026-05-31 22:45:35', CAST(strftime('%s','2026-05-31 22:45:35') AS INTEGER),'Chapter 11',211,'There are three things all wise men fear: the sea in storm, a night with no moon, and the anger of a gentle man.',NULL,'yellow','/p1.0','/p1.50'),
('notw','2026-05-28 09:00:00', CAST(strftime('%s','2026-05-28 09:00:00') AS INTEGER),'Chapter 5',140,'Words are pale shadows of forgotten names. As names have power, words have power.','the thesis of the whole book','yellow','/p2.0','/p2.40'),
('wmf','2026-03-28 20:00:00', CAST(strftime('%s','2026-03-28 20:00:00') AS INTEGER),'Chapter 40',402,'It is the questions we cannot answer that teach us the most.',NULL,'yellow','/p3.0','/p3.30'),
('piranesi','2026-02-05 10:00:00', CAST(strftime('%s','2026-02-05 10:00:00') AS INTEGER),'Part 2',88,'The Beauty of the House is immeasurable; its Kindness infinite.',NULL,'yellow','/p4.0','/p4.30');
