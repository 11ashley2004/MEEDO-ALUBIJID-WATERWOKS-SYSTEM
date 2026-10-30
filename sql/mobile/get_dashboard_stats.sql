drop function if exists get_dashboard_stats(uuid);

create or replace function get_dashboard_stats(
  p_period_id uuid,
  p_all_zones boolean default false
)
returns table (assigned int, done int)
language sql
stable
security invoker
as $$
  with my_zones as (
    select zone_id
    from meter_reader_assignments
    where user_id = auth.uid() and is_active
  ),
  accts as (
    select distinct ma.meter_account_id
    from meter_accounts ma
    join meters m on m.meter_account_id = ma.meter_account_id
    join meter_status ms on ms.meter_status_id = m.meter_status_id
    where ms.meter_status_name in
      ('Active', 'Defective', 'Stolen', 'Waterleak_After_Meter')
      and (p_all_zones or ma.zone_id in (select zone_id from my_zones))
  )
  select
    (select count(*) from accts)::int,
    (select count(distinct r.meter_account_id)
       from meter_readings r
       join accts a using (meter_account_id)
      where r.reading_period_id = p_period_id)::int;
$$;