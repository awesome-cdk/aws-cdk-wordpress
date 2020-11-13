import {Construct, Stack, StackProps} from "@aws-cdk/core";
import {Vpc} from "@aws-cdk/aws-ec2";
import {ApplicationListener, ApplicationLoadBalancer as ALB} from "@aws-cdk/aws-elasticloadbalancingv2";

export class ApplicationLoadBalancer extends Stack {
    public loadBalancer: ALB;
    private listener: ApplicationListener;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        })

        // Create the load balancer in a VPC. 'internetFacing' is 'false'
        // by default, which creates an internal load balancer.
        this.loadBalancer = new ALB(this, 'LB', {
            vpc,
            internetFacing: true,
            http2Enabled: false,
        });

    }
}