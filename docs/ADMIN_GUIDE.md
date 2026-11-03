# Redpeach SiteOps: director guide

Sign in using your mobile number (Indian numbers may be entered without +91) and temporary six-digit PIN. Set your own PIN at first login. Ask another director to reset a forgotten PIN. Five failed login attempts lock the account for 15 minutes; request limits also apply.

## Set up your team

Open Manage → Sites → Add site. Then Manage → Users → Add user. Give each person one role and a temporary PIN. Supervisors and managers need site assignments. Purchase users can work across all sites. Directors manage everything. To delegate approval for one site, select Manager and check only that site.

To hand over ownership inside the app, create another director, have them sign in and change their PIN, and ask them to deactivate or change your role. The system retains your audit history and prevents removal of the final director. Infrastructure ownership in GitHub, Neon and Cloudflare is separate.

## Daily operation

Supervisor: open a site → New requisition → add material rows and required-by dates → Submit. A local draft survives refresh and app closure; internet is needed to submit. Sign-out clears drafts on that device.

Manager/director: open a pending request and approve it, or reject with a reason. Approved content cannot be edited. Rejected or cancelled requests can be copied into a new request by a supervisor/director.

Purchase: open To order, select a request and mark items ordered. Record each quantity dispatched. You can cancel only quantities not yet dispatched and must give a reason.

Supervisor: open the request and confirm the quantity actually received. For example, ordered 20, sent 12, received 10 leaves 2 in transit and 8 still to send. A later receipt can confirm the remaining 2. Managers can also confirm receipts at their assigned sites. Directors can perform every action.

## Reports

Every role has Report, scoped to its permitted sites. Choose a date and site. Raised/activity sections refer to the selected date; Open and overdue always means now. PDF and Excel buttons generate files; on Android use the share sheet to save to Drive, send manually on WhatsApp, or another app. There are no automatic messages.

Pull down from the top of a screen or tap Refresh. Returning to the app also refreshes. Drafts are retained when refresh is used in the request form. No automatic polling occurs.

## Installation

Use only the signed APK supplied for your deployment. Permit installation from the app you use to open it if Android asks. Do not disable Play Protect or bypass security warnings; report any warning before distributing further. Future APK updates must use the same signing key and a higher version code. Normal web-interface updates come from the hosted app without reinstalling.

## Version 0.2: workspaces and permissions

Only directors see the workspace selector. It changes the home workspace between Director, Manager, Site and Purchase; it does not change the director account or remove their authority. Manage remains available.

Managers can create, approve and reject requisitions on assigned sites, including their own. Managers cannot place orders or record dispatch. Supervisors create requests and confirm receipts on assigned sites; they cannot approve. Purchase sees approved requests only, places orders and records dispatch, but does not approve or receive. Directors can do all actions across all sites. Deactivating a user removes access without deleting history; the last active director cannot be deactivated.

## Order batches and delivery

Record the quantity actually ordered and an expected delivery date for every new batch. Supplier and delivery contact are optional. If 14 of 20 sheets are ordered, 6 remain to order. Add the next batch when ordered; do not mark all 20 ordered in advance.

The app separately shows approved, ordered, dispatched, received and cancelled quantities. Dispatch cannot exceed ordered quantity. Receipts cannot exceed dispatched quantity. Aggregate dispatch/receipt is allocated to the oldest open batches first. Each batch retains its own balances, contact and expected date. Mark delays with Update delivery; changing status does not alter quantities. In transit requires a recorded dispatch. Closed batches are derived from received/cancelled balances. Cancelling unsent quantities consumes un-ordered balance first, then the newest unsent order batches, and requires a reason. Correct receipt/dispatch entry matters; reversal/returns are not supported in this release.

Earlier full-order records are imported as batches without inventing a delivery date or contact. Their original quantity totals, IDs and purchaser history are retained.

## Sites, photos and units

Sites may be Active, Pipeline, To start or Completed. Completed sites retain history and existing order follow-up but do not accept new requisitions. Directors can add one identifying site photo. Photos are compressed on the device to a small JPEG thumbnail and stored privately in the shared database; original full-resolution photos are not retained.

Search the units list or type a custom unit and select Use custom. Previously used units are suggested where you can see their requisitions. No conversion is performed between units. Quantities support three decimal places.

## Reports

The overview uses material-line counts so unlike units are never summed into an ambiguous total. Site balances and order batches show the current position, regardless of selected report date. Raised/activity sections use the selected date. Expand detailed logs in the app, or export the full branded PDF/Excel report. PDF supports English text and standard Latin units.
