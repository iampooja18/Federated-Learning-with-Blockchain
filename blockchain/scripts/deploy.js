async function main() {
  const FL = await ethers.getContractFactory("FederatedLearning");
  const fl = await FL.deploy();
  await fl.deployed();

  console.log("Contract deployed at:", fl.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
