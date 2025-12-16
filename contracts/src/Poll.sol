// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ReputationRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Poll
 * @notice Individual poll contract with reputation-weighted quadratic voting
 * @dev Each poll is a separate instance created by PollFactory
 */
contract Poll {
    // ============ Enums ============
    
    enum VotingMethod {
        QUADRATIC,    // √credits × reputation (default)
        SIMPLE,       // credits × reputation (linear)
        WEIGHTED      // credits × reputation × 1.5 (amplified)
    }
    
    // ============ Errors ============
    
    error PollClosed();
    error PollStillActive();
    error AlreadyVoted();
    error AlreadyClaimed();
    error NotAWinner();
    error InvalidOption();
    error InvalidCredits();
    error InvalidVotingMethod();
    
    // ============ State Variables ============
    
    ReputationRegistry public immutable repRegistry;
    IERC20 public immutable bettingToken;
    
    string public question;
    string[] public options;
    uint256 public immutable endTime;
    uint256 public immutable maxWeightCap;  // Maximum vote weight as multiple of average
    
    uint256 public constant MAX_CREDITS_PER_USER = 100;  // Fixed budget per user
    uint256 public constant CREDIT_PRICE = 1e18; // 1 token = 1 credit
    
    bool public isActive;
    uint256 public totalVoters;
    uint256 public totalWeightedVotes;
    uint256 public totalBetAmount; // Total tokens bet on this poll
    
    // Voting method configuration
    VotingMethod public votingMethod;     // The actual voting method used
    bool public isVotingMethodLocked;     // If true, all must use votingMethod; if false, voters choose
    
    // Track individual user bets for winner payouts
    mapping(address => uint256) public userBets;
    mapping(address => bool) public hasClaimed;
    
    // option => weighted votes
    mapping(uint256 => uint256) public results;
    
    // ============ AMM Share Tracking ============
    // user => outcome => shares owned
    mapping(address => mapping(uint256 => uint256)) public shares;
    // outcome => total shares for that outcome
    mapping(uint256 => uint256) public totalShares;
    
    // voter => Vote
    struct Vote {
        uint256 option;
        uint256 creditsSpent;
        uint256 weightedVotes;
        uint256 timestamp;
        VotingMethod method;  // Track which method was used
    }
    
    mapping(address => Vote) public votes;
    
    // ============ Events ============
    
    event VoteCast(
        address indexed voter,
        uint256 indexed option,
        uint256 creditsSpent,
        uint256 weightedVotes,
        VotingMethod method
    );
    
    event WinningsClaimed(
        address indexed winner,
        uint256 amount
    );
    
    event SharesPurchased(
        address indexed buyer,
        uint256 indexed outcome,
        uint256 shares,
        uint256 price,
        uint256 cost
    );
    
    event SharesSold(
        address indexed seller,
        uint256 indexed outcome,
        uint256 shares,
        uint256 price,
        uint256 payout
    );
    
    // ============ Constructor ============
    
    constructor(
        address _repRegistry,
        address _bettingToken,
        string memory _question,
        string[] memory _options,
        uint256 _duration,
        uint256 _maxWeightCap,
        uint8 _votingMethod,          // 0=QUADRATIC, 1=SIMPLE, 2=WEIGHTED
        bool _isVotingMethodLocked    // true=locked, false=voter choice
    ) {
        repRegistry = ReputationRegistry(_repRegistry);
        bettingToken = IERC20(_bettingToken);
        question = _question;
        options = _options;
        endTime = block.timestamp + _duration;
        maxWeightCap = _maxWeightCap;
        votingMethod = VotingMethod(_votingMethod);
        isVotingMethodLocked = _isVotingMethodLocked;
        isActive = true;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Cast a vote with reputation-weighted voting
     * @param optionId Index of the option to vote for
     * @param tokenAmount Amount of tokens to bet (1 token = 1 credit)
     * @param preferredMethod Voting method (ignored if poll method is locked)
     */
    function vote(uint256 optionId, uint256 tokenAmount, uint8 preferredMethod) external {
        if (block.timestamp >= endTime) revert PollClosed();
        // REMOVED: AlreadyVoted check - users can now trade multiple times
        if (optionId >= options.length) revert InvalidOption();
        if (tokenAmount == 0) revert InvalidCredits();
        
        // Calculate credits from token amount (1 token = 1 credit)
        uint256 credits = tokenAmount / CREDIT_PRICE;
        if (credits == 0) revert InvalidCredits();
        if (credits > MAX_CREDITS_PER_USER) revert InvalidCredits();
        
        // Transfer tokens from user to poll contract
        bool success = bettingToken.transferFrom(msg.sender, address(this), tokenAmount);
        require(success, "Token transfer failed");
        
        // Track user's bet amount
        userBets[msg.sender] = tokenAmount;
        totalBetAmount += tokenAmount;
        
        // Determine which voting method to use
        VotingMethod methodToUse;
        if (isVotingMethodLocked) {
            // Poll creator locked the method
            methodToUse = votingMethod;
        } else {
            // Voter can choose (validate input)
            if (preferredMethod > 2) revert InvalidVotingMethod();
            methodToUse = VotingMethod(preferredMethod);
        }
        
        // Calculate vote weight based on chosen method
        uint256 weightedVotes = _calculateVoteWeightWithMethod(msg.sender, credits, methodToUse);
        
        // Apply vote weight cap
        if (totalVoters == 0) {
            // For the first voter, cap them at a reasonable max to prevent setting unfair average
            // Max possible: sqrt(100) * 3x multiplier = 10 * 3 = 30 weighted votes
            uint256 absoluteMax = (10 * 3e18) / 1e18;  // ~30 weighted votes
            if (weightedVotes > absoluteMax) {
                weightedVotes = absoluteMax;
            }
        } else {
            // For subsequent voters, use average-based cap
            uint256 avgWeight = totalWeightedVotes / totalVoters;
            uint256 maxAllowed = avgWeight * maxWeightCap;
            
            if (weightedVotes > maxAllowed) {
                weightedVotes = maxAllowed;
            }
        }
        
        // Record vote (keep for backward compatibility)
        votes[msg.sender] = Vote({
            option: optionId,
            creditsSpent: credits,
            weightedVotes: weightedVotes,
            timestamp: block.timestamp,
            method: methodToUse
        });
        
        // Update shares (AMM system)
        shares[msg.sender][optionId] += credits; // 1 credit = 1 share
        totalShares[optionId] += credits;
        
        // Update results
        results[optionId] += weightedVotes;
        totalVoters++;
        totalWeightedVotes += weightedVotes;
        
        // Note: Reputation updates removed to save gas
        // Reputation is now awarded only when claiming winnings
        
        emit VoteCast(msg.sender, optionId, credits, weightedVotes, methodToUse);
    }
    
    /**
     * @notice Buy shares of an outcome (Polymarket-style trading with Sybil resistance)
     * @param outcome The outcome to buy shares for
     * @param amount Number of shares to buy
     * @dev Price is adjusted based on user's reputation:
     *      - High reputation (3x) = 33% discount
     *      - Medium reputation (1x) = base price
     *      - Low reputation (0.5x) = 2x markup
     *      - Sybil (0.3x) = 3.3x markup (makes attacks expensive)
     */
    function buyShares(uint256 outcome, uint256 amount) external {
        if (block.timestamp >= endTime) revert PollClosed();
        if (outcome >= options.length) revert InvalidOption();
        if (amount == 0) revert InvalidCredits();
        
        // Get base price from AMM
        uint256 currentTotal = totalShares[outcome];
        uint256 basePrice = (currentTotal + 100 + amount / 2) * CREDIT_PRICE / 100;
        
        // Get user's reputation multiplier (0.3x for new users, up to 3x for experts)
        uint256 repMultiplier = repRegistry.getRepMultiplier(msg.sender);
        
        // Calculate reputation-adjusted price
        // High reputation = lower price (reward experts)
        // Low reputation = higher price (penalize Sybils)
        // Formula: adjustedPrice = basePrice * (3e18 / repMultiplier)
        uint256 priceMultiplier = (3 * 1e18) / repMultiplier;
        uint256 adjustedPrice = (basePrice * priceMultiplier) / 1e18;
        uint256 cost = (adjustedPrice * amount) / CREDIT_PRICE;
        
        // Transfer tokens from user
        bool success = bettingToken.transferFrom(msg.sender, address(this), cost);
        require(success, "Token transfer failed");
        
        // Update shares
        shares[msg.sender][outcome] += amount;
        totalShares[outcome] += amount;
        totalBetAmount += cost;
        
        // Update reputation (small reward for trading)
        repRegistry.addReputation(msg.sender, 5);
        
        uint256 finalPrice = (currentTotal + 100) * CREDIT_PRICE / 100;
        emit SharesPurchased(msg.sender, outcome, amount, finalPrice, cost);
    }
    
    /**
     * @notice Sell shares of an outcome (with reputation-weighted payouts)
     * @param outcome The outcome to sell shares for
     * @param amount Number of shares to sell
     * @dev Payout is adjusted based on user's reputation (same as buy pricing)
     *      This ensures fair pricing symmetry and maintains Sybil resistance
     */
    function sellShares(uint256 outcome, uint256 amount) external {
        if (outcome >= options.length) revert InvalidOption();
        if (shares[msg.sender][outcome] < amount) revert InvalidCredits();
        if (amount == 0) revert InvalidCredits();
        
        // Calculate base payout from AMM
        uint256 currentTotal = totalShares[outcome];
        if (currentTotal < amount) revert InvalidCredits(); // Prevent negative total
        
        uint256 basePrice = (currentTotal + 100 - amount / 2) * CREDIT_PRICE / 100;
        
        // Get user's reputation multiplier
        uint256 repMultiplier = repRegistry.getRepMultiplier(msg.sender);
        
        // Calculate reputation-adjusted payout
        // Same formula as buy: high rep gets better deals
        uint256 priceMultiplier = (3 * 1e18) / repMultiplier;
        uint256 adjustedPrice = (basePrice * priceMultiplier) / 1e18;
        uint256 payout = (adjustedPrice * amount) / CREDIT_PRICE;
        
        // Update shares
        shares[msg.sender][outcome] -= amount;
        totalShares[outcome] -= amount;
        
        // Transfer tokens back
        bool success = bettingToken.transfer(msg.sender, payout);
        require(success, "Payout transfer failed");
        
        uint256 finalPrice = currentTotal > 0 ? (currentTotal + 100) * CREDIT_PRICE / 100 : CREDIT_PRICE;
        emit SharesSold(msg.sender, outcome, amount, finalPrice, payout);
    }
    
    /**
     * @notice Claim winnings if you voted for the winning option
     * @dev Winners receive their proportional share of the prize pool
     */
    function claimWinnings() external {
        if (block.timestamp < endTime) revert PollStillActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (votes[msg.sender].timestamp == 0) revert NotAWinner(); // Didn't vote
        
        // Get winning option
        (uint256 winningOption, uint256 winningVotes) = this.getWinner();
        
        // Check if user has shares in winning option
        uint256 userWinningShares = shares[msg.sender][winningOption];
        if (userWinningShares == 0) revert NotAWinner();
        
        // Calculate payout based on shares held
        // Each share of winning outcome gets proportional piece of total pool
        uint256 totalWinningShares = totalShares[winningOption];
        uint256 userShare = (userWinningShares * totalBetAmount) / totalWinningShares;
        
        hasClaimed[msg.sender] = true;
        
        // Transfer winnings
        bool success = bettingToken.transfer(msg.sender, userShare);
        require(success, "Payout transfer failed");
        
        // Award reputation for winning (only winners pay gas for reputation update)
        repRegistry.addReputation(msg.sender, 50); // 50 points for winning vs 10 for voting
        
        emit WinningsClaimed(msg.sender, userShare);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get current price for an outcome (in tokens per share)
     * @param outcome The outcome to get price for
     * @return Price in tokens (with 18 decimals)
     */
    function getPrice(uint256 outcome) external view returns (uint256) {
        if (outcome >= options.length) return 0;
        // Simple linear pricing: price = (totalShares + 100) / 100
        uint256 price = (totalShares[outcome] + 100) * CREDIT_PRICE / 100;
        return price;
    }
    
    /**
     * @notice Get all prices for all outcomes
     * @return Array of prices for each outcome
     */
    function getAllPrices() external view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](options.length);
        for (uint256 i = 0; i < options.length; i++) {
            prices[i] = (totalShares[i] + 100) * CREDIT_PRICE / 100;
        }
        return prices;
    }
    
    /**
     * @notice Get reputation-adjusted price for a specific user
     * @param outcome The outcome to get price for
     * @param user The user address to calculate adjusted price for
     * @return Adjusted price based on user's reputation
     */
    function getAdjustedPrice(uint256 outcome, address user) external view returns (uint256) {
        if (outcome >= options.length) return 0;
        
        // Get base price
        uint256 basePrice = (totalShares[outcome] + 100) * CREDIT_PRICE / 100;
        
        // Get user's reputation multiplier
        uint256 repMultiplier = repRegistry.getRepMultiplier(user);
        
        // Calculate adjusted price
        uint256 priceMultiplier = (3 * 1e18) / repMultiplier;
        uint256 adjustedPrice = (basePrice * priceMultiplier) / 1e18;
        
        return adjustedPrice;
    }
    
    /**
     * @notice Get all reputation-adjusted prices for a specific user
     * @param user The user address to calculate adjusted prices for
     * @return Array of adjusted prices for each outcome
     */
    function getAllAdjustedPrices(address user) external view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](options.length);
        uint256 repMultiplier = repRegistry.getRepMultiplier(user);
        uint256 priceMultiplier = (3 * 1e18) / repMultiplier;
        
        for (uint256 i = 0; i < options.length; i++) {
            uint256 basePrice = (totalShares[i] + 100) * CREDIT_PRICE / 100;
            prices[i] = (basePrice * priceMultiplier) / 1e18;
        }
        return prices;
    }

    /**
     * @notice Get user's shares for all outcomes
     * @param user Address to check
     * @return Array of share amounts for each outcome
     */
    function getUserShares(address user) external view returns (uint256[] memory) {
        uint256[] memory userShares = new uint256[](options.length);
        for (uint256 i = 0; i < options.length; i++) {
            userShares[i] = shares[user][i];
        }
        return userShares;
    }
    
    /**
     * @notice Get current results for all options
     */
    function getResults() external view returns (uint256[] memory) {
        uint256[] memory allResults = new uint256[](options.length);
        
        for (uint256 i = 0; i < options.length; i++) {
            allResults[i] = results[i];
        }
        
        return allResults;
    }
    
    /**
     * @notice Get winning option
     */
    function getWinner() external view returns (uint256 winningOption, uint256 winningVotes) {
        winningVotes = 0;
        winningOption = 0;
        
        for (uint256 i = 0; i < options.length; i++) {
            if (results[i] > winningVotes) {
                winningVotes = results[i];
                winningOption = i;
            }
        }
    }
    
    /**
     * @notice Preview vote weight for a user with given credits and method
     */
    function previewVoteWeight(address user, uint256 credits, uint8 method) external view returns (uint256) {
        VotingMethod voteMethod = isVotingMethodLocked ? votingMethod : VotingMethod(method);
        return _calculateVoteWeightWithMethod(user, credits, voteMethod);
    }
    
    /**
     * @notice Get poll voting configuration
     */
    function getVotingConfig() external view returns (VotingMethod method, bool isLocked) {
        return (votingMethod, isVotingMethodLocked);
    }
    
    /**
     * @notice Get all option strings
     */
    function getOptions() external view returns (string[] memory) {
        return options;
    }
    
    /**
     * @notice Get the number of options in the poll
     */
    function getOptionCount() external view returns (uint256) {
        return options.length;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Calculate vote weight with specific voting method
     * @param user Voter address
     * @param credits Number of credits spent
     * @param method Voting method to use
     */
    function _calculateVoteWeightWithMethod(
        address user,
        uint256 credits,
        VotingMethod method
    ) internal view returns (uint256) {
        // Get user's reputation multiplier (18 decimals, e.g., 1.5e18 = 1.5x)
        uint256 multiplier = repRegistry.getRepMultiplier(user);
        uint256 baseVotes;
        
        if (method == VotingMethod.QUADRATIC) {
            // Quadratic: √credits
            baseVotes = _sqrt(credits);
        } else if (method == VotingMethod.SIMPLE) {
            // Simple/Linear: credits
            baseVotes = credits;
        } else {
            // Weighted: credits × 1.5
            baseVotes = (credits * 15) / 10;
        }
        
        // Apply reputation multiplier
        uint256 weightedVotes = (baseVotes * multiplier) / 1e18;
        
        return weightedVotes;
    }
    
    /**
     * @notice Calculate vote weight using quadratic voting + reputation multiplier (deprecated)
     * @dev Formula: √(credits) × reputation_multiplier
     * @dev Kept for backward compatibility
     */
    function _calculateVoteWeight(address user, uint256 credits) internal view returns (uint256) {
        return _calculateVoteWeightWithMethod(user, credits, VotingMethod.QUADRATIC);
    }
    
    /**
     * @notice Calculate square root using Babylonian method
     * @dev Gas-efficient integer square root
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        
        // Initial guess
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        
        // Iterate until convergence
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        
        return y;
    }
}

