// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ANGEL is ERC20, ERC20Burnable, Ownable {
    uint8 private constant _DECIMALS = 18;
    uint256 private constant _INITIAL_SUPPLY = 10_000_000_000 * 10 ** _DECIMALS;

    constructor() ERC20("AngleSeed Token", "ANGEL") {
        _mint(msg.sender, _INITIAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
