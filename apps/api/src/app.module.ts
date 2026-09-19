import { Module } from "@nestjs/common";
import { CrossModule } from "./cross/cross.module";
import { ImageModule } from "./images/image.module";
import { GenomeModule } from "./genome/genome.module";
import { GeneBankModule } from "./gene-bank/gene-bank.module";
import { ReferralModule } from "./referral/referral.module";
import { BillingModule } from "./billing/billing.module";
import { AuthModule } from "./auth/auth.module";
import { IncubatorModule } from "./incubator/incubator.module";
import { PublicSpecimenModule } from "./specimens/public-specimen.module";
import { PushModule } from "./push/push.module";

@Module({ imports: [AuthModule, CrossModule, ImageModule, GenomeModule, GeneBankModule, ReferralModule, BillingModule, IncubatorModule, PublicSpecimenModule, PushModule] })
export class AppModule {}
