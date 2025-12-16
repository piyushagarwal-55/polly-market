/**
 * Utility to check if contracts are properly deployed and configured
 */

import { publicClient } from './config';
import { 
  REPUTATION_REGISTRY_ADDRESS, 
  REPUTATION_REGISTRY_ABI,
  POLL_FACTORY_ADDRESS 
} from './contracts';

export async function verifyContractSetup() {
  try {
    console.log('🔍 Verifying contract setup...');
    
    // Check if factory is set in ReputationRegistry
    const factoryAddress = await publicClient.readContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'factory',
    });
    
    console.log('Factory in Registry:', factoryAddress);
    console.log('Expected Factory:', POLL_FACTORY_ADDRESS);
    
    const isFactorySet = factoryAddress.toLowerCase() === POLL_FACTORY_ADDRESS.toLowerCase();
    
    if (!isFactorySet) {
      console.error('❌ CRITICAL: Factory is NOT set in ReputationRegistry!');
      console.error('Current factory:', factoryAddress);
      console.error('Expected factory:', POLL_FACTORY_ADDRESS);
      console.error('');
      console.error('🔧 FIX: Go to Arbiscan and call setFactory():');
      console.error(`https://sepolia.arbiscan.io/address/${REPUTATION_REGISTRY_ADDRESS}#writeContract`);
      console.error(`Set _factory to: ${POLL_FACTORY_ADDRESS}`);
      
      return {
        isValid: false,
        error: 'Factory not set in ReputationRegistry',
        factoryAddress,
        expectedFactory: POLL_FACTORY_ADDRESS,
      };
    }
    
    console.log('✅ Factory is properly configured');
    
    return {
      isValid: true,
      factoryAddress,
    };
    
  } catch (error) {
    console.error('Error verifying contract setup:', error);
    return {
      isValid: false,
      error: 'Failed to verify contract setup',
    };
  }
}
