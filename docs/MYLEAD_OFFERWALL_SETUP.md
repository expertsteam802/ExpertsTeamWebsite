# MyLead Offerwall — ExpertsTeam Credits

## Integration
- Offerwall: 797d75b8-e77d-11f1-a69c-8a5fb7be40ea
- Embed page: /earn
- Postback endpoint: https://expertsteam.giize.com/api/mylead/postback
- Player identity: authenticated Supabase user UUID, passed as player_id
- Reward amount: MyLead virtual_amount (integer ETC points), never client-calculated.

## MyLead postback configuration
Configure the postback with All lead statuses and these GET parameters:

transaction_id=[transaction_id]
player_id=[player_id]
status=[status]
virtual_amount=[virtual_amount]
program_id=[program_id]
program_name=[program_name]
payout=[payout]
payout_decimal=[payout_decimal]
currency=[currency]
ip=[ip]
country_code=[country_code]
destination_program_id=[destination_program_id]
destination_program_name=[destination_program_name]
goal_id=[goal_id]
goal_name=[goal_name]

Use MyLead's Offerwall player ID option so the iframe sends the same player_id to the postback. Do not send an email address as player_id.

## Server environment
Set these only in the server deployment environment (never VITE_ variables):
- SUPABASE_URL — the ExpertsTeam Supabase project URL.
- SUPABASE_SERVICE_ROLE_KEY — service role key / secret key with server-only access.
- MYLEAD_ALLOWED_IPS — comma-separated MyLead postback source IPs. The initial documented Offerwall source is 159.65.61.13; update this value if MyLead confirms additional/changed source IPs.

The endpoint checks the connecting source IP before processing. It does not trust an IP supplied in query parameters. The general MyLead Postback API also documents an X-MyLead-Security-Hash; this implementation does not guess its signing algorithm or invent a key. If MyLead confirms that hash verification is mandatory for this Offerwall account, implement it using their supplied official example before enabling live crediting.

## Database deployment
Apply supabase/migrations/20261123220000_mylead_offerwall_postback.sql to the same Supabase project used by ExpertsTeam. It creates a private audit table and a service-role-only processing RPC. The RPC validates the player UUID and status; deduplicates on MyLead transaction ID; records pending and pre-approved events without spendable credits; credits the exact integer virtual_amount once on approval; records rejection and reverses only the available balance if a previously approved transaction is later rejected; and never allows the profile balance to become negative.

## Go-live test
1. Confirm the player_id option is enabled in MyLead and the iframe receives the authenticated UUID.
2. Apply the migration to the production ExpertsTeam Supabase project.
3. Set the server environment variables and deploy the application.
4. Confirm the MyLead source IP shown in deployment logs matches MYLEAD_ALLOWED_IPS.
5. Run a MyLead test conversion. Verify pending is not credited, approved credits once, and replaying the same transaction does not credit again.
6. Test a rejected status and verify the conversion is marked rejected.

Do not treat an HTTP success from the iframe as a reward. Only the verified server postback changes the balance.