// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FederatedLearning {
    struct UpdateInfo {
        address client;
        string updateUri;
        string updateHash;
        uint256 dataSize;
    }

    struct RoundInfo {
        uint256 roundId;
        string globalModelUri;
        string globalModelHash;
        bool collecting;
        bool aggregatedStored;
        UpdateInfo[] updates;
    }

    address public owner;

    // 🔥 NEW — stores latest active round number
    uint256 public currentRound;

    mapping(uint256 => RoundInfo) public rounds;

    event RoundStarted(uint256 roundId, string uri);
    event UpdateSubmitted(uint256 roundId, address client);
    event RoundClosed(uint256 roundId);
    event AggregatedStored(uint256 roundId, string uri);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentRound = 0;
    }

    function startRound(uint256 roundId, string memory uri, string memory hash)
        external
        onlyOwner
    {
        RoundInfo storage r = rounds[roundId];
        r.roundId = roundId;
        r.globalModelUri = uri;
        r.globalModelHash = hash;
        r.collecting = true;

        // 🔥 Set active round
        currentRound = roundId;

        emit RoundStarted(roundId, uri);
    }

    function submitUpdate(uint256 roundId, string memory uri, string memory hash, uint256 dataSize)
        external
    {
        require(rounds[roundId].collecting, "Round closed");

        rounds[roundId].updates.push(UpdateInfo({
            client: msg.sender,
            updateUri: uri,
            updateHash: hash,
            dataSize: dataSize
        }));

        emit UpdateSubmitted(roundId, msg.sender);
    }

    function closeRound(uint256 roundId) external onlyOwner {
        rounds[roundId].collecting = false;

        emit RoundClosed(roundId);
    }

    function storeAggregated(uint256 roundId, string memory uri, string memory hash)
        external
        onlyOwner
    {
        rounds[roundId].globalModelUri = uri;
        rounds[roundId].globalModelHash = hash;
        rounds[roundId].aggregatedStored = true;

        // (optional) next round will be started by orchestrator
        
        emit AggregatedStored(roundId, uri);
    }

    function getUpdateCount(uint256 roundId) external view returns (uint256) {
        return rounds[roundId].updates.length;
    }

    function getUpdate(uint256 roundId, uint256 index)
        external
        view
        returns (address, string memory, string memory, uint256)
    {
        UpdateInfo storage u = rounds[roundId].updates[index];
        return (u.client, u.updateUri, u.updateHash, u.dataSize);
    }
}
