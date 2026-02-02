(function () {
  if (window.__votingUiLoaded) return;
  window.__votingUiLoaded = true;

  if (!window.setVotingScenario) window.setVotingScenario = () => { };
  window.VotingScenario = null;

  function setVotingScenario(s) {
    const want = scenarioDisplay[s] || [];
    display_or_not.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = want.includes(id) ? null : "none";
    });
    window.VotingScenario = s;
    const t = document.getElementById("conversationTitle");
    document.getElementById("tremolaTitle").style.display = "none";
    if (s === "voting-list") {
      t.innerHTML = "<font size=+1><strong>Voting</strong><br>Select or create poll</font>";
      voting_load_list();
    } else if (s === "voting-board") {
      const p = tremola.voting.active[tremola.voting.current] || { peers: [] };
      t.innerHTML = `<font size=+1><strong>Poll with ${p.peers.map(fid2display).join(", ")
        }</strong></font>`;
    }
  }
  window.setVotingScenario = setVotingScenario;

  // list view
  function voting_load_list() {
    closeOverlay();
    const lst = document.getElementById("div:voting-list");
    lst.innerHTML = "";
    if (!tremola.voting) tremola.voting = { active: {} };
    for (const nm in tremola.voting.active) {
      const p = tremola.voting.active[nm],
        voted = Object.keys(p.clear).length,
        total = p.peers.length,
        shardsHave = Object.keys(p.shares).length,
        shardsNeed = p.k;
      lst.insertAdjacentHTML("beforeend",
        `<div>
           <button class="voting_list_button"
                   style="overflow:hidden;width:60%;background:#ebf4fa;"
                   onclick='voting_load_board("${nm}")'>
             Vote (${voted}/${total})
           </button>
           <button class="voting_list_button"
                   style="width:20%;text-align:center;"
                   onclick='voting_delete_poll("${nm}")'>
             del
           </button>
           <span style="font-size:smaller;color:#666">
             Shards: ${shardsHave}/${shardsNeed}
           </span>
         </div>`);
    }
  }
  window.voting_load_list = voting_load_list;

  // board view
  function voting_load_board(nm) {
    tremola.voting.current = nm;
    setVotingScenario("voting-board");
    const p = tremola.voting.active[nm],
      board = document.getElementById("div:voting-board");
    board.innerHTML = "";

    board.insertAdjacentHTML("beforeend",
      `<div style="margin:6pt"><b>What's for lunch?</b></div>`);

    // shard status
    const have = Object.keys(p.shares).length,
      need = p.k,
      from = have > 0 ? ` (from: ${Object.keys(p.shares).map(fid2display).join(", ")
        })` : "";
    board.insertAdjacentHTML("beforeend",
      `<div style="margin:4pt;color:#666;font-size:smaller">
         Shards: ${have}/${need}${from}
       </div>`);

    // options
    p.opts.forEach((opt, idx) => {
      const voted = p.clear[myId] !== undefined,
        chk = (p.clear[myId] === idx) ? "checked disabled" : "",
        dis = voted ? "disabled" : "";
      board.insertAdjacentHTML("beforeend",
        `<div style="margin:4pt">
           <input type="checkbox" ${chk} ${dis}
                  onclick="voting_cellclick(${idx})">
           <label> ${opt}</label>
         </div>`);
    });

    // result
    board.insertAdjacentHTML("beforeend",
      `<div id="vote-res" style="margin-top:10pt"></div>`);
    voting_update_result();
  }
  window.voting_load_board = voting_load_board;

  // tally display
  function voting_update_result() {
    const nm = tremola.voting.current; if (!nm) return;
    const p = tremola.voting.active[nm];
    const total = p.peers.length;

    // recieved ballots
    const arrived = Object.keys(p.votes).length;
    // decrypted ballots
    const decrypted = Object.keys(p.clear).length;

    const counts = Array(p.opts.length).fill(0);
    Object.values(p.clear).forEach(v => counts[v]++);

    const res = document.getElementById("vote-res");
    if (!res) return;

    if (arrived < total) {
      res.textContent = `Waiting for votes… (${arrived}/${total})`;
    } else if (decrypted < total) {
      res.textContent = `Decrypting… (${decrypted}/${total})`;
    } else {
      const max = Math.max(...counts);
      const winners = p.opts.filter((_, i) => counts[i] === max);
      res.textContent = `Result: ${winners.join(", ")} (${max}/${total})`;
    }
  }
  window.voting_update_result = voting_update_result;

})();