SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'payments';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payments' AND table_schema = 'zivvvo' ORDER BY ordinal_position;
