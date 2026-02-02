(function () {
  if (window.__votingLoaded) return;
  window.__votingLoaded = true;

  
  const gw = window.top || window;
  if (!gw.miniApps) gw.miniApps = {};

  function ensureState() {
    if (!window.tremola) window.tremola = {};
    if (typeof tremola.voting !== 'object') tremola.voting = { active: {} };
    else if (typeof tremola.voting.active !== 'object')
      tremola.voting.active = {};
  }
  ensureState();

  // small Paillier demo
  const gcd    = (a, b) => b === 0n ? a : gcd(b, a % b);
  const lcm    = (a, b) => (a * b) / gcd(a, b);
  const L      = (u, n) => (u - 1n) / n;
  const modInv = (a, m) => {
    let [m0, x0, x1] = [m, 0n, 1n];
    while (a > 1n) {
      const q = a / m;
      [a, m]   = [m, a % m];
      [x0, x1] = [x1 - q * x0, x0];
    }
    return x1 < 0n ? x1 + m0 : x1;
  };

  // tiny fixed "primes" for demo
  const p    = 61n;
  const q    = 53n;
  const n    = p * q;
  const n2   = n * n;
  const g    = n + 1n;
  const lambda0   = lcm(p - 1n, q - 1n);

  const paillier_enc = m => (g ** BigInt(m) * 2n ** n) % n2;
  const paillier_dec = (c, lambda, mu) => (L((BigInt(c) ** lambda) % n2, n) * mu) % n;

  function wr(o) { writeLogEntry(JSON.stringify(o)); }
  function persistSafe() { try { persist(); } catch { } }

  function tryReconstruct(nm) {
    const p = tremola.voting.active[nm];
    if (!p || p.lambdaStr) return;
    const have = Object.keys(p.shares).length;
    if (have < p.k) return;

    const arr = Object.entries(p.shares)
      .slice(0, p.k)
      .map(([, sh]) => ({ x: BigInt(sh.x), y: BigInt(sh.y) }));

    // Lagrange at 0
    let secret = 0n;
    arr.forEach((_, j) => {
      let num = 1n, den = 1n;
      const { x: xj, y: yj } = arr[j];
      arr.forEach((_, m) => {
        if (m !== j) {
          num = (num * -arr[m].x) % n;
          den = (den * (xj - arr[m].x)) % n;
        }
      });
      const ellj = (num * modInv((den + n) % n, n)) % n;
      secret = (secret + yj * ellj) % n;
    });

    const lambda = (secret + n) % n;
    const mu = modInv(L((g ** lambda) % n2, n), n);
    p.lambdaStr = lambda.toString();
    p.muStr = mu.toString();

    // decrypt any buffered votes
    Object.entries(p.votes).forEach(([fid, cipher]) => {
      try {
        p.clear[fid] = Number(paillier_dec(cipher, lambda, mu));
      } catch (_) { }
    });
    persistSafe();

    if (
      window.VotingScenario === "voting-board" &&
      tremola.voting.current === nm
    ) {
      voting_load_board(nm);
    }
  }

  gw.miniApps.voting = {
    handleRequest(cmd, args) {
      ensureState();
      switch (cmd) {
        case "onBackPressed":
          window.VotingScenario === "voting-board"
            ? setVotingScenario("voting-list")
            : quitApp();
          break;
        case "plus_button":
          voting_new_poll();
          break;
        case "members_confirmed":
          voting_confirm_members();
          break;
        case "b2f_initialize":
        case "b2f_new_event":
          voting_load_list();
          break;
        case "incoming_notification":
          voting_decode(args.args);
          break;
      }
      return "resp voting";
    }
  };
  gw.miniApps.customApp = gw.miniApps.voting;

  let voting_creation_guard = false;

  function voting_new_poll() {
    launchContactsMenu("Voting", "Pick one or more friends");
  }

  function voting_confirm_members() {
    ensureState();
    if (voting_creation_guard) return;
    voting_creation_guard = true;
    setTimeout(() => (voting_creation_guard = false), 400);

    const picked = [];
    for (const fid in tremola.contacts) {
      const cb = document.getElementById(fid);
      if (fid !== myId && cb && cb.checked) picked.push(fid);
    }
    if (!picked.length) return alert("Select at least one friend");

    const ref   = "V" + (Math.random() * 1e6 | 0);
    const peers = [myId, ...picked];
    const N     = peers.length;
    const k     = N - 1;

    // build Shamir poly of degree k-1
    const poly = [lambda0];
    for (let i = 1; i < k; i++) {
      poly.push(BigInt(Math.floor(Math.random() * Number(n))));
    }

    // evaluate each peer’s share f(1)..f(N)
    const myShares = {};
    peers.forEach((fid, i) => {
      const x = BigInt(i + 1);
      let y = 0n;
      for (let d = poly.length - 1; d >= 0; d--) {
        y = (y * x + poly[d]) % n;
      }
      myShares[fid] = { x: x.toString(), y: y.toString() };
    });

    // init poll state
    tremola.voting.active[ref] = {
      peers, opts: ["Pizza", "Burger", "Salad"],
      votes: {}, clear: {},
      shares: {},  // will fill in as we get them
      k,
      lambdaStr: null, muStr: null
    };

    // send each peer their share
    peers.forEach(peer => {
      wr({
        type: "N",
        from: myId,
        to: peer,
        nm: ref,
        peers, opts: ["Pizza", "Burger", "Salad"],
        share: myShares[peer]
      });
    });

    // process our own share locally
    voting_on_rx({
      type: "N",
      from: myId,
      to: myId,
      nm: ref,
      peers, opts: ["Pizza", "Burger", "Salad"],
      share: myShares[myId]
    });

    voting_load_board(ref);
    setVotingScenario("voting-board");
  }

  function voting_cellclick(idx) {
    ensureState();
    const nm = tremola.voting.current;
    const p  = tremola.voting.active[nm];

    const prevVoters = Object.keys(p.votes).filter(fid => fid !== myId);

    const c  = paillier_enc(idx).toString();

    p.votes[myId]  = c;
    p.clear[myId]  = idx;
    persistSafe();

    // broadcast vote
    wr({ type: "V", nm, from: myId, cipher: c });

    // now hand out only to those who had already voted
    prevVoters.forEach(fid => {
      wr({
        type: "S",
        nm, from: myId, to: fid,
        share: p.shares[myId]
      });
    });

    voting_load_board(nm);
  }

  function voting_decode(a) {
    const m = Array.isArray(a) ? a[0] : a;
    voting_on_rx(m);
  }

  function voting_on_rx(msg) {
    ensureState();
    const polls = tremola.voting.active;

    if (msg.type === "N") {
      // only pick up the share addressed to you
      if (msg.to !== myId) return;
      if (!msg.peers.includes(myId)) return;

      let p = polls[msg.nm];
      if (!p) {
        p = polls[msg.nm] = {
          peers: [], opts: [],
          votes: {}, clear: {},
          shares: {}, k: 0,
          lambdaStr: null, muStr: null
        };
      }
      p.peers = msg.peers;
      p.opts  = msg.opts;
      p.k     = msg.peers.length - 1;

      // store this peer’s share
      const owner = p.peers[Number(msg.share.x) - 1];
      p.shares[owner] = msg.share;
      persistSafe();

      tryReconstruct(msg.nm);

      if (window.VotingScenario === "voting-list") voting_load_list();
      if (
        window.VotingScenario === "voting-board" &&
        tremola.voting.current === msg.nm
      ) voting_load_board(msg.nm);

      return;
    }

    if (msg.type === "S") {

      if (msg.to !== myId) return;

      const p = polls[msg.nm];
      if (!p) return;
      const owner = p.peers[Number(msg.share.x) - 1];
      p.shares[owner] = msg.share;
      persistSafe();

      tryReconstruct(msg.nm);

      if (window.VotingScenario === "voting-list") voting_load_list();
      if (
        window.VotingScenario === "voting-board" &&
        tremola.voting.current === msg.nm
      ) voting_load_board(msg.nm);

      return;
    }

    if (msg.type === "V") {
      const p = polls[msg.nm];
      if (!p) return;
      p.votes[msg.from] = msg.cipher;
      if (p.lambdaStr) {
        try {
          p.clear[msg.from] = Number(
            paillier_dec(msg.cipher, BigInt(p.lambdaStr), BigInt(p.muStr))
          );
        } catch (_) { }
      }
      persistSafe();

      // if I've already voted, send my shard back
      if (p.votes[myId]) {
        const myShare = p.shares[myId];
        if (myShare) {
          wr({
            type: "S",
            nm: msg.nm,
            from: myId,
            to: msg.from,
            share: myShare
          });
        }
      }

      if (window.VotingScenario === "voting-list") voting_load_list();
      if (
        window.VotingScenario === "voting-board" &&
        tremola.voting.current === msg.nm
      ) voting_load_board(msg.nm);
    }
  }

  function voting_delete_poll(nm) {
    ensureState();
    delete tremola.voting.active[nm];
    persistSafe();
    voting_load_list();
  }

  Object.assign(window, {
    voting_new_poll,
    voting_confirm_members,
    voting_load_list,
    voting_load_board,
    voting_delete_poll,
    voting_cellclick,
    voting_update_result
  });
})();
