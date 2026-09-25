# Admin asset-location sharing

Admin asset details offer Copy location, WhatsApp and Assign RELAY job. Copy/WhatsApp contain the last reported position, timestamp, age and a Google Maps link. WhatsApp opens a prepared message; the admin selects its recipient and sends it.

Assign RELAY job requires an enabled internal fitter, job reference, breakdown description, site contact and phone number. It creates an OPEN item in the existing RELAY Tasks inbox with a clickable map link and phone number. It does not create a parts ticket or change an existing parts ticket's stores operator. This shares a specific dated snapshot; it does not grant fleet-wide access.

GET/POST `/api/assets/assign` require server-side admin authorization. Recipients must have enabled internal tracking access, a supported internal role and no front-counter interface. The server loads the position from the selected provider's existing fleet service. Missing/invalid locations fail closed. Client coordinates, actor IDs and task status are never trusted. Writes use the admin's authenticated connection and existing task RLS.

The form generates one UUID per assignment. Retrying the same submission returns its previously saved task. Reusing that UUID for a different asset, recipient or details fails; an uncertain insert can be retried without duplicating work. No task is generated for copy/WhatsApp, and no extra fleet popup is introduced.
