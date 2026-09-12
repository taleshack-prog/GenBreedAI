import { Module } from "@nestjs/common";
import { GeneBankController } from "./gene-bank.controller";
import { GeneBankService } from "./gene-bank.service";
import { CrossModule } from "../cross/cross.module";
import { EconomyModule } from "../economy/economy.module";

@Module({
  imports: [CrossModule, EconomyModule],
  controllers: [GeneBankController],
  providers: [GeneBankService],
})
export class GeneBankModule {}
