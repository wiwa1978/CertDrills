ALTER TABLE "certdrill_scenarios" DROP CONSTRAINT "certdrill_scenarios_status_check";
ALTER TABLE "certdrill_scenarios" ADD CONSTRAINT "certdrill_scenarios_status_check" CHECK ("status" IN ('draft', 'validated', 'published'));
