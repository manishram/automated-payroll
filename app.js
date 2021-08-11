if (process.env.NODE_EV !== 'production') require('dotenv').config();
const octokitCore = require('@octokit/core');
const { Octokit } = octokitCore;
const octokit = new Octokit({
  auth: process.env.GH_AUTH_TOKEN,
});
const axios = require('axios');
// const sendersAccount = new Account("fakeSigningKey");
// const bankUrl = "http://18.218.193.164";

// const paymentHandlerOptions = {
//   account: sendersAccount,
//   bankUrl: bankUrl,
// };

// const paymentHandler = new tnb.AccountPaymentHandler(paymentHandlerOptions);

// // This is very important.
// // Method for getting the Bank and Primary validator Transactions fees
// await paymentHandler.init();

(async () => {
    try {
        // get core-team data
        const response = await axios.get('https://api.thenewboston.com/core_members');
        const teamMembers = response.data.results;
        // initialize empty array for bank transactions
        const txs = [];
        const owner = 'nax3t';
        const repo = 'test-timesheets';
        // const owner = 'thenewboston-developers';
        // const repo = 'Contributor-Payments';

        // get all issues that are labeled as Timesheets and Ready to pay
        const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=Timesheet,Ready%20to%20pay`);
        for (const issue of data) {
            // destructure needed properties from issue object
            const { body, number, title, user, html_url, events_url } = issue;
            // check if Ready to pay label added by correct user
            const { data } = await axios.get(events_url);
            const isValidLabel = data.find(action => action.label.name === 'Ready for payment' && action.actor.id === 6356890);
            // if label not added by correct user then skip to next issue
            if (!isValidLabel) {
                console.log(`Invalid label creator for ${title}, skipping to next timesheet.`);
                continue;
            }
            // parse recipient account number
            const recipient = body.match(/[a-z0-9]{64}/) ? body.match(/[a-z0-9]{64}/)[0] : false;
            // Find number of hours that come after Total Time Spent
            let totalTimeSpent = body.match(/total time spent\r\n\.?\d+\.?(0|5)? hour/i) ? body.match(/total time spent\r\n\.?\d+\.?(0|5)? hour/i)[0] : 0;
            // If totalTimeSpent doesn't exist then check again, but use Time Spent instead of Total Time Spent and pull last one in the array
            if (!totalTimeSpent) {
                const timeSpent = body.match(/time spent\r\n\.?\d+\.?(0|5)? hour/i);
                totalTimeSpent = timeSpent && timeSpent.input ? timeSpent[0] : timeSpent && timeSpent.length > 1 ? timeSpent[timeSpent.length - 1] : 0;
            }
            totalTimeSpent = totalTimeSpent ? totalTimeSpent.match(/\d+\.?(0|5)?/)[0] : 0;
            // pull username and match from teamMembers to pull hourly rate
            const member = teamMembers.find(member => {
                if (member.user.github_username === user.login ||
                    title.toLowerCase().includes(member.user.display_name.toLowerCase()) ||
                    member.user.account_number === recipient) {
                    return member;
                }
            });
            const rate = member && member.hourly_rate ? member.hourly_rate : 0;
            // calculate amount to be paid
            const amount = rate * totalTimeSpent;
            const issueId = number;
            let date = title.match(/\d\d\/\d\d\/\d\d\d\d/);
            date = date ? date[0].replace(/\//g, '_') : false;
            // generate memo
            const memo = `TNB_TS_${issueId}_${date}`;
            // if (amount && memo && recipient && isValidLabel) {
            if (memo && recipient && isValidLabel) {
                // send individual transaction here
                // txs.push({
                //     amount,
                //     memo,
                //     recipient,
                // });
                // upon successful transaction, update issue labels
                // add paid
                await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
                    owner,
                    repo,
                    issue_number: issueId,
                    labels: ['Paid']
                });
                // remove Ready to pay
                await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
                    owner,
                    repo,
                    issue_number: issueId,
                    name: 'Ready to pay'
                });
                // close the issue
                await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
                    owner,
                    repo,
                    issue_number: issueId,
                    state: 'closed'                    
                });
            } else {
                console.log(`Missing data for: ${title}\n${html_url}\nTransaction Object:`, {
                    amount,
                    memo,
                    recipient,
                });
                console.log('--------------------------');
            }
        }
        console.log('Transaction Data for Bulk Payment:', txs);
        // send bulk payments to the blockchain
        // await sendBulkPayments(txs);
    } catch (err) {
        console.log(err);
    }
})();