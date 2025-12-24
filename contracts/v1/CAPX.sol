// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CAPX is ERC20, ERC20Burnable, Ownable {
    uint8 private constant _DECIMALS = 18;
    uint256 private constant _MAX_SUPPLY = 100_000_000 * 10 ** _DECIMALS;

    constructor() ERC20("CAPShield Token", "CAPX") {
        _mint(msg.sender, _MAX_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function getMaxSupply() public pure returns (uint256) {
        return _MAX_SUPPLY;
    }
}
